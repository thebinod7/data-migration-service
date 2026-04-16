import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info', // default log level
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.File({ filename: 'migration.log' }),
  ],
  exitOnError: false,
});


export const flushLogs = (): Promise<void> => {
  return new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end(); // 👈 forces write flush
  });
}