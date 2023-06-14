const axios = require('axios');
const {StatusCodes} = require('http-status-codes');

const { BookingRepository } = require('../repositories');
const { ServerConfig } = require('../config')
const db = require('../models');
const AppError = require('../utils/error/app-error');
const bookingRepository = new BookingRepository();
async function createBooking(data) {
       const transaction = await db.sequelize.transaction();

       try {
           const flight = await axios.get(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${data.flightId}`);
           const flightData = flight.data.data;
           if(data.noofSeats>flightData.totalSeats){
            throw new AppError('NOT ENOUGH SEATS AVAILABLE',StatusCodes.BAD_REQUEST);
           }

           const totalBillingAmount = data.noofSeats*flightData.price;
           console.log(`TOTAL BILLING AMOUNT :`,totalBillingAmount);

           const bookingPayload ={...data,totalCost: totalBillingAmount};
           const booking = await bookingRepository.create(bookingPayload,transaction);
           

           await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flight/${data.flightId}/seats`, 
           { 
            seats:data.noofSeats
           });

           await transaction.commit();
           return booking;

       }
       catch (error)
        {
        await transaction.rollback();
        throw error;
        }
    }
module.exports = {
    createBooking
}