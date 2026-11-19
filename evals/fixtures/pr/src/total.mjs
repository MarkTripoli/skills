export const total = (items) => items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
