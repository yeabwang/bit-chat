const socketsByUser = new Map<string, Set<string>>();

// Returns true when this is the user's first socket
export const addSocket = (userId: string, socketId: string): boolean => {
  const sockets = socketsByUser.get(userId);
  if (sockets) {
    sockets.add(socketId);
    return false;
  }
  socketsByUser.set(userId, new Set([socketId]));
  return true;
};

/** Returns true when this was the user's last socket, they just went offline. */
export const removeSocket = (userId: string, socketId: string): boolean => {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size > 0) return false;

  socketsByUser.delete(userId);
  return true;
};

export const isOnline = (userId: string) => socketsByUser.has(userId);

export const onlineUserIds = () => [...socketsByUser.keys()];

export const socketCountFor = (userId: string) => socketsByUser.get(userId)?.size ?? 0;

/** Test hook. Nothing in src calls this. */
export const resetPresence = () => socketsByUser.clear();
