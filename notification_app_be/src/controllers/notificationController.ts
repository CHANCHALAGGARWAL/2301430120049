const { Log } = require("../../../logging_middleware/index");

const notifications: any[] = [];
let idCounter = 1;

const getNotifications = async (req: any, res: any) => {
  await Log("backend", "info", "controller", "Fetching all notifications");
  res.json(notifications);
};

const createNotification = async (req: any, res: any) => {
  const { title, message, userId } = req.body;
  if (!title || !message || !userId) {
    await Log("backend", "error", "controller", "Missing required fields in create notification");
    return res.status(400).json({ error: "title, message, userId required" });
  }
  const notification = {
    id: idCounter++,
    title,
    message,
    userId,
    read: false,
    createdAt: new Date()
  };
  notifications.push(notification);
  await Log("backend", "info", "controller", `Notification created for user ${userId}`);
  res.status(201).json(notification);
};

const markAsRead = async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  const notif = notifications.find((n: any) => n.id === id);
  if (!notif) {
    await Log("backend", "warn", "controller", `Notification ${id} not found`);
    return res.status(404).json({ error: "Not found" });
  }
  notif.read = true;
  await Log("backend", "info", "controller", `Notification ${id} marked as read`);
  res.json(notif);
};

const deleteNotification = async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  const index = notifications.findIndex((n: any) => n.id === id);
  if (index === -1) {
    await Log("backend", "warn", "controller", `Notification ${id} not found for deletion`);
    return res.status(404).json({ error: "Not found" });
  }
  notifications.splice(index, 1);
  await Log("backend", "info", "controller", `Notification ${id} deleted`);
  res.json({ message: "Deleted successfully" });
};

module.exports = { getNotifications, createNotification, markAsRead, deleteNotification };