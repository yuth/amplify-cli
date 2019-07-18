const cleanUpQueue = [];
let CLEANUP_REGISTERED = false;

export function addCleanupTask(context, task: Function) {
  if (!CLEANUP_REGISTERED) {
    console.log("end1");

    registerCleanup(context);
    CLEANUP_REGISTERED = true;
  }

  cleanUpQueue.push(task);
}
function registerCleanup(context) {
  console.log("end");
  // do all the cleanup
  process.on('SIGINT', async () => {
      const promises = cleanUpQueue.map(fn => fn(context));
      await Promise.all(promises);
      process.exit(0);
  });
}