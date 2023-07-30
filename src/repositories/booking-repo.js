const { StatusCodes } = require('http-status-codes');
const{Enums}=require('../utils/common');
const{BOOKED,CANCELLED}=Enums.Booking_status;
const { Booking } = require('../models');
const CrudRepository = require('./crud-repositort');
const {Op}=require("sequelize");
class BookingRepository extends CrudRepository {
    constructor() {
        super(Booking);
    }

    async createBooking(data,transaction){
        console.log("inside create repo")
        const response = await Booking.create(data,{transaction:transaction});
        return response;
    }

    async get(data, transaction) {
        console.log("IN get")
        const response = await Booking.findByPk(data, {transaction: transaction});
        if(!response) {
            throw new AppError('Not able to fund the resource', StatusCodes.NOT_FOUND);
        }
        return response;
    }

    async update(id, data, transaction) { // data -> {col: value, ....}
        const response = await Booking.update(data, {
            where: {
                id: id
            }
        }, {transaction: transaction});
        return response;
    }
    async cancelOldBookings(timestamp){
        console.log("IN REPO");
        const response = await Booking.update({status:CANCELLED},{
            where: {
                [Op.and]:[
                    {
                        createdAt:{
                            [Op.lt]:timestamp
                        }
                    },
                    {
                        status:{
                            [Op.ne]:BOOKED
                        }
                    },
                    {
                        status:{
                            [Op.ne]:CANCELLED
                        }
                    }
                ]
            }
        });
        return response;
    }

    async getAll(timestamp)
    {
        const response = await Booking.findAll({
            where: {
                [Op.and]:[
                    {
                        createdAt:{
                            [Op.lt]:timestamp
                        }
                    },
                    {
                        status:{
                            [Op.ne]:BOOKED
                        }
                    },
                    {
                        status:{
                            [Op.ne]:CANCELLED
                        }
                    }
                ]
            }
        });
        return response;

    }
    }
     



   
module.exports = BookingRepository;