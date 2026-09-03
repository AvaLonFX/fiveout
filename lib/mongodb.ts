import "server-only";
import { MongoClient } from "mongodb";
let connection: Promise<MongoClient> | undefined;
export default function getMongoClient() {
  if (!connection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Reaction storage is not configured");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    connection = client.connect().catch(error => { connection = undefined; void client.close(); throw error; });
  }
  return connection;
}
