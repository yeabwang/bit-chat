import UserModel from "../models/user.model";
import { ConflictException, UnauthorizedException } from "../utils/app-error";
import { LoginSchemaType, RegisterSchemaType } from "../validators/auth.validator";

export const registerService = async ({
  name,
  userName,
  password,
  avatar,
}: RegisterSchemaType) => {
  // the unique index on userName is the real guard; this only gives a better message
  const existingUser = await UserModel.findOne({ userName });
  if (existingUser) throw new ConflictException("Username already taken");

  return UserModel.create({ name, userName, password, avatar });
};

export const loginService = async ({ userName, password }: LoginSchemaType) => {
  const user = await UserModel.findOne({ userName });

  // one error for both cases, so an unknown username is not distinguishable
  if (!user || !(await user.comparePassword(password)))
    throw new UnauthorizedException("Invalid username or password");

  return user;
};
