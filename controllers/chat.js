import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import {
  ALERT,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
} from "../constants/event.js";
import {
  deleteFilesFromCloudinary,
  emitEvent,
  uploadFilesToCloudinary,
} from "../utils/features.js";
import { getOtherMember } from "../lib/helper.js";
import { User } from "../models/user.js";
import { Message } from "../models/message.js";

const newGroupChat = TryCatch(async (req, res, next) => {
  const { name, members } = req.body;

  const allMembers = [...members, req.user];

  await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });

  emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);
  emitEvent(req, REFETCH_CHATS, members);

  return res.status(201).json({
    success: true,
    message: "Group Created",
  });
});

const getMyChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({ members: req.user }).populate(
    "members",
    "name avatar"
  );

  const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
    const otherMember = getOtherMember(members, req.user);

    return {
      _id,
      groupChat,
      avatar: groupChat
        ? members.slice(0, 3).map(({ avatar }) => avatar.url)
        : [otherMember.avatar.url],
      name: groupChat ? name : otherMember.name,
      members: members.reduce((prev, curr) => {
        if (curr._id.toString() !== req.user.toString()) {
          prev.push(curr._id);
        }
        return prev;
      }, []),
    };
  });

  return res.status(200).json({
    success: true,
    chats: transformedChats,
  });
});

const getMyGroups = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({
    members: req.user,
    creator: req.user,
    groupChat: true,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));

  return res.status(200).json({
    success: true,
    groups,
  });
});

const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return next(new ErrorHandler("Chat Not Found", 400));
  }
  if (!chat.groupChat) {
    return next(new ErrorHandler("Group Chat Not Found", 400));
  }
  if (chat.creator.toString() !== req.user.toString()) {
    return next(new ErrorHandler("Your Are Not Allowed To Add Members", 403));
  }

  const allNewMembersPromise = members.map((i) => User.findById(i, "name"));
  const allNewMembers = await Promise.all(allNewMembersPromise);
  const uniqueMembers = allNewMembers
    .filter((i) => !chat.members.includes(i._id.toString()))
    .map((i) => i._id);

  chat.members.push(...uniqueMembers);
  if (chat.members.length > 100) {
    return next(new ErrorHandler("Group Members Limit Reached", 400));
  }
  await chat.save();

  const allUsersName = allNewMembers.map((i) => i.name).join(",");
  emitEvent(
    req,
    ALERT,
    chat.members,
    `${allUsersName} You Have Been Added In The Group`
  );
  emitEvent(req, REFETCH_CHATS, chat.members);
  return res.status(200).json({
    success: true,
    message: "Member Added Successfully",
  });
});

const removeMembers = TryCatch(async (req, res, next) => {
  const { userId, chatId } = req.body;
  const [chat, userThatWillBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);
  if (!chat) {
    return next(new ErrorHandler("Chat Not Found", 400));
  }
  if (!chat.groupChat) {
    return next(new ErrorHandler("Group Chat Not Found", 400));
  }
  if (chat.creator.toString() !== req.user.toString()) {
    return next(
      new ErrorHandler("Your Are Not Allowed To Remove Members", 403)
    );
  }
  if (userId.toString() === chat.creator.toString()) {
    return next(
      new ErrorHandler("You Cannot Remove Yourself You are An Admin", 400)
    );
  }
  if (chat.members.length <= 3) {
    return next(new ErrorHandler("Group Must Have At Least 3 Members", 400));
  }

  const allchatMembers = chat.members.map((i) => i.toString());

  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );
  await chat.save();
  emitEvent(req, ALERT, chat.members, {
    message: `${userThatWillBeRemoved} Ki Gaand Pe Laat Maarke Bhaga Diya`,
    chatId,
  });
  emitEvent(req, REFETCH_CHATS, allchatMembers);
  return res.status(200).json({
    success: true,
    message: "Member Removed Successfully",
  });
});

const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return next(new ErrorHandler("Chat Not Found", 400));
  }
  if (!chat.groupChat) {
    return next(new ErrorHandler("Group Chat Not Found", 400));
  }
  if (chat.creator.toString() === req.user.toString()) {
    return next(
      new ErrorHandler("You Cannot Leave the Group As You Are The Admin", 400)
    );
  }
  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString()
  );
  if (remainingMembers.length < 3) {
    return next(new ErrorHandler("Group Must Have At Least 3 Members", 400));
  }
  if (chat.creator.toString() === req.user.toString()) {
    const randomElement = Math.floor(Math.random() * remainingMembers.length);
    const newCreator = remainingMembers[randomElement];
    chat.creator = newCreator;
    chat.members = remainingMembers;
  }
  const [user] = await Promise.all([
    User.findById(req.user, "name"),
    chat.save(),
  ]);
  if (userId.toString() === chat.creator.toString()) {
    return next(
      new ErrorHandler("You Cannot Remove Yourself You are An Admin", 400)
    );
  }
  emitEvent(req, ALERT, chat.members, {
    message: `User ${user.name} Has Left The Group`,
    chatId,
  });
  return res.status(200).json({
    success: true,
    message: "Member Removed Successfully",
  });
});

const sendAttachment = TryCatch(async (req, res, next) => {
  const { chatId } = req.body;
  const files = req.files || [];
  if (files.length < 1) {
    return next(new ErrorHandler("Please Upload Attachments", 400));
  }
  if (files.length > 5) {
    return next(new ErrorHandler("Attachments Cannot Be More Than 5", 400));
  }
  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);
  if (!chat) {
    return next(new ErrorHandler("Chat Not Found", 400));
  }

  if (files.length < 1) {
    return next(new ErrorHandler("Please Provide Attachments", 400));
  }
  const attachments = await uploadFilesToCloudinary(files);
  const messageForDB = {
    content: "",
    attachments,
    sender: me._id,
    chat: chatId,
  };
  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };
  const message = await Message.create(messageForDB);
  emitEvent(req, NEW_MESSAGE, chat.members, {
    message: messageForRealTime,
    chat: chatId,
  });
  emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });
  return res.status(200).json({
    success: true,
    message,
  });
});

const getChatDetails = TryCatch(async (req, res, next) => {
  if (req.query.populate === "true") {
    const chat = await Chat.findById(req.params.id)
      .populate("members", "name avatar")
      .lean();
    if (!chat) {
      return next(new ErrorHandler("Chat Not Found", 400));
    }
    chat.members = chat.members.map(({ avatar, _id, name }) => ({
      avatar: avatar.url,
      _id,
      name,
    }));
    return res.status(200).json({
      success: true,
      chat,
    });
  } else {
    const chat = await Chat.findById(req.params.id);
    if (!chat) {
      return next(new ErrorHandler("Chat Not Found", 400));
    }
    return res.status(200).json({
      success: true,
      chat,
    });
  }
});

const renameGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { name } = req.body;
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not allowed to rename the group", 403)
    );

  chat.name = name;

  await chat.save();

  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "Group renamed successfully",
  });
});

const deleteChat = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const chat = await Chat.findById(chatId);
  if (!chat) {
    return next(new ErrorHandler("Chat Not Found", 400));
  }
  const members = chat.members;
  if (chat.groupChat && chat.creator.toString() !== req.user.toString()) {
    return next(
      new ErrorHandler("You Are Not Allowed To Delete This Group Chat", 400)
    );
  }
  if (!chat.groupChat && !chat.members.includes(req.user.toString())) {
    new ErrorHandler("You Are Not Allowed To Delete This Group Chat", 400);
  }
  //   Here we have to dete All Messages as well as attachments or files from cloudinary

  const messageWithAttachments = await Message.find({
    chat: chatId,
    attachments: { $exists: true, $ne: [] },
  });
  const public_ids = [];
  messageWithAttachments.forEach(({ attachments }) => {
    attachments.forEach(({ publicId }) => public_ids.push(publicId));
  });

  await Promise.all([
    deleteFilesFromCloudinary(public_ids),
    chat.deleteOne(),
    Message.deleteMany({ chat: chatId }),
  ]);
  emitEvent(req, REFETCH_CHATS, members);
  return res.status(200).json({
    success: true,
    message: "Chat Deleted Successfully",
  });
});

const getMessages = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { page = 1 } = req.query;
  const resultPerPage = 20;
  const skip = (page - 1) * resultPerPage;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.members.includes(req.user.toString()))
    return next(
      new ErrorHandler("You are not allowed to access this chat", 403)
    );

  const [messages, totalMessagesCount] = await Promise.all([
    Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .populate("sender", "name")
      .limit(resultPerPage)
      .lean(),
    Message.countDocuments({ chat: chatId }),
  ]);
  const totalPages = Math.ceil(totalMessagesCount / resultPerPage) || 0;
  return res.status(200).json({
    success: true,
    messages: messages.reverse(),
    totalPages,
  });
});

export {
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
};
