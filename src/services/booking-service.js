const axios = require("axios");
/*
Axios is a promise-based HTTP library that lets developers make requests to either their own or a third-party server to fetch data. It offers different ways of making requests such as GET , POST , PUT/PATCH , and DELETE .
*/
const { StatusCodes } = require("http-status-codes");
const { Enums } = require("../utils/common");
const { BOOKED, CANCELLED } = Enums.Booking_status;
const { BookingRepository } = require("../repositories");
const { ServerConfig } = require("../config");
const db = require("../models");
const AppError = require("../utils/error/app-error");
const bookingRepository = new BookingRepository();
async function createBooking(data) {
  /*
 We will be also making one transaction inside the 
 updateRemainingSeats() function in the flight-repository.js  
 because if anyone starts using this function createBooking(data) we wanted to be 
 club inside 1 transaction that either everything goes 
 or nothing goes.
*/

  // This is a Managed Transactions -> committing and rolling back the transaction should be done manually by the user (by calling the appropriate Sequelize methods).

  const transaction = await db.sequelize.transaction(); // Whenever I need to wrap a query within a transaction, I use the transaction object. I can pass the `transaction` object.
  // Wrapping all of these in 1 transaction

  try {
    const flight = await axios.get(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${data.flightId}`
    );
    const flightData = flight.data.data;
    if (data.noofSeats > flightData.totalSeats) {
      // Is the number of seats we want to book available within the flights?
      throw new AppError("NOT ENOUGH SEATS AVAILABLE", StatusCodes.BAD_REQUEST);
    }

    const totalBillingAmount = data.noofSeats * flightData.price;
    console.log(`TOTAL BILLING AMOUNT :`, totalBillingAmount);

    const bookingPayload = { ...data, totalCost: totalBillingAmount };
    // When users send somethings we have currently userId, noOfSeats, flightId. In order to create a booking we need a totalCost as well so destructuring the object `data` using the spread operator `...data` and then adding one more key-value pair
    console.log("BookingPayLoad : ", bookingPayload);
    const booking = await bookingRepository.create(bookingPayload, transaction);

    // This is going to create a new booking for us and will be in an `INITIATED` state and the transaction will reserve the selected number of seats for the current booking for 5 mins for the end users to actually complete the payment, if not completed the payment on time then whatever no. of seats blocked by the transaction for the current booking should be released.
    await axios.patch(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${data.flightId}/seats`,
      {
        seats: data.noofSeats, // passing the data inside the req.body
      }
    ); // Booking has been `INITIATED` so reserve noOfSeats in the actual flights or update the seats in the actual flights using patch()

    await transaction.commit(); // If everything goes well do a commit
    return booking;
  } catch (error) {
    await transaction.rollback(); // If we get any error/anything fails above do a rollback
    console.log(error);
    throw error;
  }
}

async function makePayment(data) {
  const transaction = await db.sequelize.transaction();
  try {
    const bookingDetails = await bookingRepository.get(
      data.bookingId,
      transaction
    );
    if (bookingDetails.status == CANCELLED) {
      throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);
    }
    if (bookingDetails.status == BOOKED) {
      throw new AppError(
        "You have already booked your flight! You can't retry the request on a successful Booking ID",
        StatusCodes.BAD_REQUEST
      );
    }
    console.log(bookingDetails);
    const bookingTime = new Date(bookingDetails.createdAt);
    const currentTime = new Date();
    if (currentTime - bookingTime > 300000) {
      await cancelBooking(data.bookingId);
      throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);
    }
    // The payment that we have made does not match the booking payment
    if (bookingDetails.totalCost != data.totalCost) {
      throw new AppError(
        "There is a discrepancy in the amount of the payment",
        StatusCodes.PAYMENT_REQUIRED
      );
    }
    if (bookingDetails.userId != data.userId) {
      throw new AppError(
        "The user corresponding to the booking doesnt match",
        StatusCodes.BAD_REQUEST
      );
    }
    // we assume here that payment is successful
    await bookingRepository.update(
      data.bookingId,
      { status: BOOKED },
      transaction
    );

    await axios.patch(
        `${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${bookingDetails.flightId}/seats`,
        {
          seats: bookingDetails.noofSeats,
          dec: 0,
        }
      );

    await transaction.commit();

  } catch (error) {
    await transaction.rollback();

    if (error.statusCodes == StatusCodes.BAD_REQUEST) {
      throw new AppError(
        "Booking Session has expired | The payment has already been made ",
        error.statusCodes
      );
    }

    if (error.statusCodes == StatusCodes.PAYMENT_REQUIRED) {
      throw new AppError("Discrepancy in the payment", error.statusCodes);
    }

    if (error.statusCodes == StatusCodes.NOT_FOUND) {
      throw new AppError(
        "For the request you made, there is no bookingId / userId available for payment!",
        error.statusCodes
      );
    }
    throw error;
  }
}

async function cancelBooking(bookingId) {
  const transaction = await db.sequelize.transaction();
  try {
    const bookingDetails = await bookingRepository.get(bookingId, transaction);
    console.log(bookingDetails);
    if (bookingDetails.status == CANCELLED) {
      await transaction.commit();
      return true;
    }
    await axios.patch(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${bookingDetails.flightId}/seats`,
      {
        seats: bookingDetails.noofSeats,
        dec: 0,
      }
    );
    await bookingRepository.update(
      bookingId,
      { status: CANCELLED },
      transaction
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    if (error.statusCodes == StatusCodes.NOT_FOUND) {
        throw new AppError(
          // error.message, //Overriding the error message thrown from the destroy(id) function inside the crud-repository file
          "For the request you made, there is no bookingId available to cancel!",
          error.statusCodes
        );
      }
      throw new AppError(
        "Sorry! The Cancellation was unsuccessful. Cancellation Service is down",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
  }
}

/*
We need to execute the same logic as cancelBooking() after 
every 5-10 mins to check for bookings whose sessions are 
already expired and can never be booked by the respected 
users. So all the seats occupied by those bookings should 
be set free so that other users can book those seats.

The task cancelBooking() must be executed periodically after
a certain interval. We can use a timer using setTimeInterval()
to execute that after every 5-10 minutes. There is a problem
with that if the server is down for some time then those
changes/cancellations were not gonna work.

To handle this kind of case we have CRON JOBS

Cron jobs are scheduled at recurring intervals, specified 
using a format based on unix-cron. You can define a schedule
so that your job runs multiple times a day, or runs on 
specific days and months.

We will use a package called node-cron.

*/

async function cancelOldBookings() {
  try {
    console.log("INSIDE SERVICES");
    const time = new Date(Date.now() - 1000 * 60);
    const allBookingDetails = await bookingRepository.getAll(time);
    console.log("allBookingDetails =", allBookingDetails);
    for (const booking of allBookingDetails) {
      const { flightId, noofSeats } = booking.dataValues;

      await axios.patch(
        `${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${flightId}/seats`,
        {
          seats: noofSeats,
          dec:0,
        }
      );
    }
    
    const response = await bookingRepository.cancelOldBookings(time);

    await transaction.commit();
    return response;
  } catch (error) {
    await transaction.rollback();
    throw new AppError(
      " An error has occured while running the Cron Jobs",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
}

module.exports = {
  createBooking,
  makePayment,
  cancelOldBookings,
  cancelBooking
};
