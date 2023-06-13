
class AppError extends Error {
    constructor(message,statusCode)
    {
        super(message);
        this.statusCodes =statusCode;
        this.explanation =message;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports =AppError;