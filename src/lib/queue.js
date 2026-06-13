class SimpleQueue {
  constructor(name, delayMs = 1000) {
    this.name = name;
    this.delayMs = delayMs;
    this.items = [];
    this.running = false;
  }

  add(task) {
    this.items.push(task);
    this.run().catch(console.error);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    while (this.items.length > 0) {
      const task = this.items.shift();
      try {
        await task();
      } catch (error) {
        console.error(`[queue:${this.name}] task failed`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    this.running = false;
  }
}

module.exports = {
  broadcastQueue: new SimpleQueue('broadcast', 1500),
  reminderQueue: new SimpleQueue('reminder', 1000),
  rankingQueue: new SimpleQueue('ranking', 2000),
};
