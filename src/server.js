import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import dns from "dns";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import bcrypt from "bcryptjs";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadDir = path.join(rootDir, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || "change-this-secret";

const allowedOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Add the production Vercel origins to the allowed list (explicitly required)
const productionAllowed = [
  "https://chemfix-adminpanel.vercel.app",
  "https://chemfix-adminpanel-blond.vercel.app",
  "https://chemfix.vercel.app",
  "https://chm-two.vercel.app",
];

const mergedAllowedOrigins = Array.from(new Set([...allowedOrigins, ...productionAllowed]));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      // allow server-to-server requests or tools like curl/postman
      callback(null, true);
      return;
    }
    if (mergedAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Ensure preflight OPTIONS requests are handled for all routes
app.options("*", cors(corsOptions));
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 600 },
    image: { type: String, required: true },
  },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);

// Configure Cloudinary if env vars are present. Accept either a single `CLOUDINARY_URL`
// or the individual `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
);

if (cloudinaryConfigured) {
  if (process.env.CLOUDINARY_URL) {
    // Example: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}

let upload;
if (cloudinaryConfigured) {
  const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: process.env.CLOUDINARY_FOLDER || "chemfix",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 1600, crop: "limit" }],
    },
  });

  upload = multer({
    storage: cloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(_req, file, callback) {
      if (!file.mimetype.startsWith("image/")) {
        callback(new Error("Only image uploads are allowed"));
        return;
      }
      callback(null, true);
    },
  });
} else {
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename(_req, file, callback) {
      const safeName = file.originalname.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
      callback(null, `${Date.now()}-${safeName}`);
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(_req, file, callback) {
      if (!file.mimetype.startsWith("image/")) {
        callback(new Error("Only image uploads are allowed"));
        return;
      }
      callback(null, true);
    },
  });
}

function productDto(req, product) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  let imageUrl = "";
  if (!product.image) {
    imageUrl = "";
  } else if (product.image.startsWith("http")) {
    imageUrl = product.image;
  } else if (cloudinaryConfigured) {
    // `product.image` is treated as Cloudinary public_id
    try {
      imageUrl = cloudinary.url(product.image, { secure: true });
    } catch {
      imageUrl = `${baseUrl}/uploads/${product.image}`;
    }
  } else {
    imageUrl = `${baseUrl}/uploads/${product.image}`;
  }

  return {
    id: product._id.toString(),
    title: product.title,
    description: product.description,
    imageUrl,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  try {
    req.admin = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: "Please login again." });
  }
}

function deleteImage(filename) {
  if (!filename) return;
  if (cloudinaryConfigured) {
    // filename expected to be Cloudinary public_id
    cloudinary.uploader.destroy(filename).catch(() => {});
    return;
  }

  const imagePath = path.join(uploadDir, filename);
  if (imagePath.startsWith(uploadDir)) {
    fs.promises.unlink(imagePath).catch(() => {});
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Basic root status page to make visiting http://localhost:5000/ useful
app.get("/", (_req, res) => {
  res.send(
    `
    <html>
      <head><meta charset="utf-8"><title>CHEMfix API</title></head>
      <body style="font-family:system-ui,Segoe UI,Roboto,Arial;margin:32px">
        <h1>CHEMfix API</h1>
        <p>API is running. Check the <a href="/api/health">health endpoint</a>.</p>
        <p>If you plan to run the admin frontend locally, start it after the backend.</p>
      </body>
    </html>
    `,
  );
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required." });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const token = jwt.sign({ email: user.email, role: user.role }, jwtSecret, { expiresIn: "8h" });
    res.json({ token, admin: { email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products.map((product) => productDto(req, product)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title || !description || !req.file) {
      res.status(400).json({ message: "Title, description and image are required." });
      return;
    }

    const product = await Product.create({
      title,
      description,
      image: req.file.filename,
    });

    res.status(201).json(productDto(req, product));
  } catch (error) {
    if (req.file) deleteImage(req.file.filename);
    next(error);
  }
});

app.put("/api/products/:id", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      if (req.file) deleteImage(req.file.filename);
      res.status(404).json({ message: "Product not found." });
      return;
    }

    if (req.body.title) product.title = req.body.title;
    if (req.body.description) product.description = req.body.description;
    if (req.file) {
      deleteImage(product.image);
      product.image = req.file.filename;
    }

    await product.save();
    res.json(productDto(req, product));
  } catch (error) {
    if (req.file) deleteImage(req.file.filename);
    next(error);
  }
});

app.delete("/api/products/:id", requireAuth, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      res.status(404).json({ message: "Product not found." });
      return;
    }

    deleteImage(product.image);
    res.json({ message: "Product deleted." });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error.message || "Something went wrong.";
  res.status(error.status || 500).json({ message });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(port, () => {
      console.log(`CHEMfix API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  });
