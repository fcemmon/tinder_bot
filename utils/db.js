const { Client } = require("pg");
const moment = require("moment");
const Storage = require("node-storage");
const store = new Storage("utils/metadata.json");
const ip = process.env.IP_ADDRESS

const getDBClient = async () => {
  let client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();
  return client;
};

// const runQuery = async (query, values) => {
//   return await (await getDBClient()).query(query, values);
// };

const runQuery = async (query, values) => {
  const connection = await getDBClient();
  const res = await connection.query(query, values);
  await connection.end();
  return res;
};

const getJobIds = async () => {
  try {
    const query = `
  select swipe_jobs.id, vps_infos.ip  from swipe_jobs join vps_infos on swipe_jobs.vps_info_id = vps_infos.id where status = 'pending' and ip = $1`;
    const { rows } = await runQuery(query, [ip]);
    var jobIds = [];
    const result = rows?.map((r) => {
      jobIds.push({ id: r.id, delay: r.delay });
      return r;
    });

    console.log(result)

    if (jobIds.length > 3) {
      jobIds = jobIds.filter((obj, index) => index < 3);
    }
    // console.log(newJobIds, "newJobIds");

    return jobIds;
  } catch(e) {
    console.log(e)
    return []
  }
};

module.exports = { getJobIds };
