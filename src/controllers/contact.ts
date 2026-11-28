import { Request, Response } from "express";
import { check, validationResult } from "express-validator";
import { createMailTransporter } from "./user";

const BUG_REPORT_TO = "JohnMichaelReedFAS@gmail.com";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_DAY = 40;

const hitsByIp = new Map<string, number[]>();
let dayWindowStart = Date.now();
let dayCount = 0;

/**
 * Heroku appends the client address it actually saw. Earlier addresses in
 * X-Forwarded-For can be supplied by the caller, so the last one is the one to limit.
 */
const clientIp = (req: Request): string => {
    const forwarded = req.headers["x-forwarded-for"];
    const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    if (typeof header === "string" && header.trim().length > 0) {
        const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
        if (parts.length > 0) {
            return parts[parts.length - 1];
        }
    }
    return req.ip || "unknown";
};

const tooManyContactEmails = (ip: string): boolean => {
    const now = Date.now();
    if (now - dayWindowStart >= DAY_MS) {
        dayWindowStart = now;
        dayCount = 0;
    }
    const recent = (hitsByIp.get(ip) || []).filter((sentAt) => now - sentAt < HOUR_MS);
    hitsByIp.set(ip, recent);
    return dayCount >= MAX_PER_DAY || recent.length >= MAX_PER_IP_PER_HOUR;
};

const recordContactEmail = (ip: string): void => {
    const recent = hitsByIp.get(ip) || [];
    recent.push(Date.now());
    hitsByIp.set(ip, recent);
    dayCount += 1;
};

const verifyRecaptcha = async (token: string, remoteIp: string): Promise<boolean> => {
    const secret = process.env.GOOGLE_RECAPTCHA_SECRET;
    if (!secret || !token) {
        return false;
    }

    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    params.set("remoteip", remoteIp);

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    });
    const data = await response.json() as { success?: boolean };
    return data.success === true;
};

/**
 * Contact form page.
 * @route GET /contact
 */
export const getContact = (req: Request, res: Response) => {
    const sitekey = process.env.GOOGLE_RECAPTCHA_SITE_KEY || "";
    if (!sitekey || !process.env.GOOGLE_RECAPTCHA_SECRET) {
        console.warn("[Contact] GOOGLE_RECAPTCHA_SITE_KEY or GOOGLE_RECAPTCHA_SECRET is not set. Bug reports will not be emailed until both are set.");
    }
    res.render("contact", {
        title: "Contact The Developer",
        sitekey
    });
};

export const getMobileAppShortcut = (req: Request, res: Response) => {
    res.render("mobile-app-shortcut", {
        title: "Mobile App Shortcut"
    });
};

/**
 * Email a bug report through the same Gmail account used for password reset.
 * @route POST /contact
 */
export const postContact = async (req: Request, res: Response) => {
    await check("name", "Name cannot be blank").trim().notEmpty().isLength({ max: 200 }).run(req);
    await check("email", "Email is not valid").trim().isEmail().isLength({ max: 320 }).run(req);
    await check("message", "Please describe the issue.").trim().notEmpty().isLength({ max: 4000 }).run(req);

    const errors = validationResult(req).array().map((error) => ({ msg: error.msg }));
    const ip = clientIp(req);

    if (!process.env.GOOGLE_RECAPTCHA_SITE_KEY || !process.env.GOOGLE_RECAPTCHA_SECRET) {
        errors.push({ msg: "Bug reports are not being sent yet because reCAPTCHA is not configured." });
    } else if (tooManyContactEmails(ip)) {
        errors.push({ msg: "Too many bug reports were sent recently. Please try again later." });
    } else {
        const token = typeof req.body["g-recaptcha-response"] === "string" ? req.body["g-recaptcha-response"] : "";
        if (!token) {
            errors.push({ msg: "Please complete the reCAPTCHA." });
        } else {
            try {
                const passed = await verifyRecaptcha(token, ip);
                if (!passed) {
                    errors.push({ msg: "reCAPTCHA validation failed. Please try again." });
                }
            } catch (error) {
                console.error("[Contact] reCAPTCHA verification error:", error);
                errors.push({ msg: "Could not verify the reCAPTCHA. Please try again." });
            }
        }
    }

    if (errors.length > 0) {
        req.flash("errors", errors);
        return res.redirect("/contact");
    }

    const transporter = createMailTransporter();
    if (!transporter) {
        req.flash("errors", { msg: "The email sender is not configured, so the bug report could not be sent." });
        return res.redirect("/contact");
    }

    const name = String(req.body.name).replace(/[\r\n]+/g, " ").trim();
    const email = String(req.body.email).replace(/[\r\n]+/g, "").trim();
    const message = String(req.body.message).trim();
    const fromAddress = process.env.EMAIL_FROM
        || (process.env.EMAIL_USER ? `Sea Air Towers <${process.env.EMAIL_USER}>` : `Sea Air Towers <${BUG_REPORT_TO}>`);

    recordContactEmail(ip);

    try {
        await transporter.sendMail({
            to: BUG_REPORT_TO,
            from: fromAddress,
            replyTo: email,
            subject: "Sea Air Towers bug report",
            text:
                `Name: ${name}\n` +
                `Email: ${email}\n\n` +
                `${message}\n`
        });
        console.log(`[Contact] Bug report emailed to ${BUG_REPORT_TO}`);
        req.flash("success", { msg: "Your bug report has been sent. Thank you." });
    } catch (error) {
        console.error("[Contact] Failed to send bug report:", error);
        req.flash("errors", { msg: "The bug report could not be sent. Please try again shortly." });
    }

    return res.redirect("/contact");
};
