import errorHandler from "errorhandler";
import app from "./app";


/**
 * Error Handler. Provides full stack
 */
if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
    app.set("env", "development");
    app.use(errorHandler());
} else {
    app.set("env", process.env.NODE_ENV);
}

app.use((err: any, req: any, res: any, next: any) => {
    console.error(`[Server Error] ${req.method} ${req.url}:`, err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).send("Internal Server Error: " + (err.message || err));
});

/**
 * Start Express server.
 */
const server = app.listen(app.get("port"), () => {
    console.log(
        "  App is running at http://localhost:%d in %s mode",
        app.get("port"),
        app.get("env")
    );
    console.log("  Press CTRL-C to stop\n");
});

export default server;
