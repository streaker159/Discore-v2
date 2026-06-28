try {
  require("cheerio");
  console.log("cheerio found");
} catch(e) {
  console.log("cheerio MISSING: " + e.message);
}
