import { Types } from "mongoose";
import UserModel from "../models/user.model";

export const findByIdUserService = async (userId: string) => {
  return await UserModel.findById(userId);
};

export const getUsersService = async (userId: Types.ObjectId) => {
  return UserModel.find({ _id: { $ne: userId } }).select("-password");
};
