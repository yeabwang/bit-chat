import { Router } from "express";
import authRoutes from "./auth.route";
import conversationRoutes from "./conversation.route";
import friendRoutes from "./friend.route";
import userRoutes from "./user.route";

const router = Router();
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/conversations", conversationRoutes);
router.use("/friends", friendRoutes);

export default router;
