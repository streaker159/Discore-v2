"use strict";

const path = require("path");

const SHOOT_PATH = path.join(process.cwd(), "assets", "sniper", "shoot.png");
const WINNER_PATH = path.join(process.cwd(), "assets", "sniper", "winner.png");

/**
 * Returns a Discord attachment object for the shoot/challenge image.
 */
function getShootAttachment() {
  return { attachment: SHOOT_PATH, name: "shoot.png" };
}

/**
 * Returns a Discord attachment object for the winner image.
 */
function getWinnerAttachment() {
  return { attachment: WINNER_PATH, name: "winner.png" };
}

module.exports = {
  SHOOT_PATH,
  WINNER_PATH,
  getShootAttachment,
  getWinnerAttachment,
};
