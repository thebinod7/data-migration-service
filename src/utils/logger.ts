import winston from 'winston';

const logLineFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.simple()
);

const allowInfoOnly = winston.format((info) => {
  if (info.level !== 'info') {
    return false;
  }
  return info;
});

export const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({
      filename: 'migration.log',
      format: winston.format.combine(allowInfoOnly(), logLineFormat),
    }),
    new winston.transports.File({
      filename: 'migration-error.log',
      level: 'error',
      format: logLineFormat,
    }),
  ],
  exitOnError: false,
});


export const flushLogs = (): Promise<void> => {
  return new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end(); // 👈 forces write flush
  });
}
