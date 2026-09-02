import { Types } from "mongoose";
import { UserDocument } from "../models/user.model";

// passport puts the authenticated UserDocument on req.user;
declare global {
  namespace Express {
    interface User extends UserDocument {
      _id: Types.ObjectId;
    }
  }
}

export {};
