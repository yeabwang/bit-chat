import bcrypt from "bcryptjs";

export const hashValue = (value: string, salt = 10) => {
  return bcrypt.hash(value, salt);
};

export const compareValue = (value: string, hashedVal: string) => {
  return bcrypt.compare(value, hashedVal);
};
