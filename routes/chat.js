import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  newGroupChat,
  getMyChats,
  getMyGroups,
  addMembers,
  removeMembers,
  leaveGroup,
  sendAttachment,
  getChatDetails,
  renameGroup,
  deleteChat,
  getMessages,
} from "../controllers/chat.js";
import { attachmentMulter } from "../middlewares/multer.js";
import {
  addMembersValidator,
  chatIdValidator,
  newGroupValidator,
  removeMembersValidator,
  renameValidator,
  sendAttachmentValidator,
  validatorHandler,
} from "../lib/validators.js";

const app = express.Router();

app.use(isAuthenticated);
app.post("/new", newGroupValidator(), validatorHandler, newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroups);
app.put("/addmembers", addMembersValidator(), validatorHandler, addMembers);
app.put(
  "/removemember",
  removeMembersValidator(),
  validatorHandler,
  removeMembers
);
app.delete("/leave/:id", chatIdValidator(), validatorHandler, leaveGroup);
app.post(
  "/message",
  attachmentMulter,
  sendAttachmentValidator(),
  validatorHandler,
  sendAttachment
);
app.get("/message/:id", chatIdValidator(), validatorHandler, getMessages);
app
  .route("/:id")
  .get(chatIdValidator(), validatorHandler, getChatDetails)
  .put(renameValidator(),validatorHandler,renameGroup)
  .delete(chatIdValidator(),validatorHandler,deleteChat);
export default app;
