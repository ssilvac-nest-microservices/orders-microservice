import 'dotenv/config';
import * as joi from 'joi';

interface IEnvVars {
  PORT: number;
}

const envVarsSchema = joi
  .object({
    PORT: joi.number().required(),
  })
  .unknown(true);

const { error, value } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: IEnvVars = value;

export const envs = {
  port: envVars.PORT,
};
