const cron = require("node-cron");
const { syncAllCollections } = require('./../controllers/waxController');

let cycleCompleted = true;

cron.schedule("* * * * *", async () => {
   try {
     if(cycleCompleted == true) {
        cycleCompleted = false;
        await syncAllCollections();
        cycleCompleted = true
     }
   } catch (err) {
    console.log('Error in wax syncing job:', err);
    cycleCompleted = true;
   }
});

module.exports = cron;