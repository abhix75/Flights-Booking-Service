const { BookingService } = require('../services');
const { SuccessResponse, ErrorResponse } = require('../utils/common');
const { StatusCodes} = require('http-status-codes')

const inMemDb = {};
async function createBooking(req, res) {
    try {
        console.log("body",req.body);
        const response = await BookingService.createBooking({
            flightId: req.body.flightId,
            userId: req.body.userId,
            noofSeats: req.body.noofSeats
        });
        SuccessResponse.data = response;
        return res
                .status(StatusCodes.OK)
                .json(SuccessResponse);
    } catch(error) {
        console.log("controller catching")
        ErrorResponse.error = error;
        return res
                .status(StatusCodes.INTERNAL_SERVER_ERROR)
                .json(ErrorResponse);
    }
}

async function makePayment(req, res) {
    try {

        const idempotencyKey = req.headers["x-idempotency-key"];

        if(!idempotencyKey)
        {
            ErrorResponse.error = "The IDEMPOTENCY KEY is missing";
            return res.status(StatusCodes.BAD_REQUEST)
                      .json(ErrorResponse);
        }
        if(inMemDb[idempotencyKey])
        {
            ErrorResponse.error = "cannot retry the request on a Successful Payment";
            return res.status(StatusCodes.BAD_REQUEST)
                      .json(ErrorResponse);
        }
        console.log("body",req.body);
        const response = await BookingService.makePayment({
            totalCost: req.body.totalCost,
            userId: req.body.userId,
            bookingId: req.body.bookingId
        });
        SuccessResponse.data = response;
        return res
                .status(StatusCodes.OK)
                .json(SuccessResponse);
    } catch(error) {
        console.log("controller catching")
        ErrorResponse.error = error;
        return res
                .status(StatusCodes.INTERNAL_SERVER_ERROR)
                .json(ErrorResponse);
    }
}



module.exports = {

    createBooking,
    makePayment
}