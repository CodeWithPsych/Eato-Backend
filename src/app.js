import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import restaurantSetupRoutes from "./routes/restaurantSetup.routes.js"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,

}))

app.use(express.json({limit: "16kb"}))

app.use(express.urlencoded({extended: true, limit: "16kb"}))

app.use(express.static("public"))

app.use(cookieParser())

// routes 
app.use("/api/restaurant-setup", restaurantSetupRoutes);


export { app }