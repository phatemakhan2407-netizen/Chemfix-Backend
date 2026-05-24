import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

dotenv.config();

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: "admin@chemfix.com" });
    if (existingAdmin) {
      console.log("Admin user already exists");
      await mongoose.disconnect();
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash("admin123", 10);

    // Create admin user
    const admin = await User.create({
      email: "admin@chemfix.com",
      password: hashedPassword,
      role: "admin",
    });

    console.log("✓ Admin user created successfully");
    console.log(`Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
}

seedAdmin();
