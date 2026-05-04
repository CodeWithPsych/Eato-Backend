import logger from "../utils/logger.js";

/**
 * Rooms strategy:
 *  - restaurantId        → owner dashboard + chef kitchen (all orders for that restaurant)
 *  - table:{rid}:{num}   → customer's table (receives their own order status updates)
 */
export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    // ── Join a restaurant room (owner / chef) ─────────────────
    socket.on("join:restaurant", ({ restaurantId }) => {
      if (!restaurantId) return;
      socket.join(restaurantId);
      logger.debug(`Socket ${socket.id} joined restaurant room: ${restaurantId}`);
    });

    // ── Join a table room (customer) ──────────────────────────
    socket.on("join:table", ({ restaurantId, tableNumber }) => {
      if (!restaurantId || !tableNumber) return;
      const room = `table:${restaurantId}:${tableNumber}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined table room: ${room}`);
    });

    // ── Leave rooms ───────────────────────────────────────────
    socket.on("leave:restaurant", ({ restaurantId }) => {
      socket.leave(restaurantId);
    });

    socket.on("leave:table", ({ restaurantId, tableNumber }) => {
      socket.leave(`table:${restaurantId}:${tableNumber}`);
    });

    socket.on("disconnect", () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });
};

/**
 * Events emitted from controllers (reference):
 *
 * order:new      → to restaurant room   — full order object (new pending order from customer)
 * order:updated  → to restaurant room   — full order object (status changed by chef/owner)
 * order:status   → to table room        — { orderId, status, eta? } (customer notification)
 */