"use strict";

import crypto from "crypto";
import nodemailer from "nodemailer";
import passport from "passport";
import { ApartmentType, Landlord, LandlordDocument, AuthToken } from "../models/Landlord";
import { Apartment, ApartmentDocument } from "../models/Apartment";
import { ApartmentBookings, ApartmentBookingsDocument } from "../models/ApartmentBookings";
import { Request, Response, NextFunction } from "express";
import { IVerifyOptions } from "passport-local";
import { body, check, validationResult } from "express-validator";
import "../config/passport";

/**
 * Login page.
 * @route GET /login
 */
export const getLogin = (req: Request, res: Response): void => {
    if (req.user) {
        return res.redirect("/");
    }
    res.render("account/login", {
        title: "Login",
    });
};

/**
 * Sign in using email and password.
 * @route POST /login
 */
export const postLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("email", "Email is not valid").isEmail().run(req);
    await check("password", "Password cannot be blank").isLength({min: 1}).run(req);
    await body("email").normalizeEmail({ gmail_remove_dots: false }).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/login");
    }

    passport.authenticate("local", (err: Error, user: LandlordDocument, info: IVerifyOptions) => {
        if (err) { return next(err); }
        if (!user) {
            req.flash("errors", {msg: info.message});
            return res.redirect("/login");
        }
        req.logIn(user, (err) => {
            if (err) { return next(err); }
            req.flash("success", { msg: "Success! You are signed in." });
            res.redirect(req.session.returnTo || "/");
        });
    })(req, res, next);
};

/**
 * Log out.
 * @route GET /logout
 */
export const logout = (req: Request, res: Response, next: NextFunction): void => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect("/");
    });
};

/**
 * Signup page.
 * @route GET /signup
 */
export const getSignup = (req: Request, res: Response): void => {
    if (req.user) {
        return res.redirect("/");
    }
    res.render("account/signup", {
        title: "Create Account"
    });
};

/**
 * Create a new local account.
 * @route POST /signup
 */
export const postSignup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("email", "Email is not valid").isEmail().run(req);
    await check("password", "Password must be at least 4 characters long").isLength({ min: 4 }).run(req);
    await check("confirmPassword", "Passwords do not match").equals(req.body.password).run(req);
    await body("email").normalizeEmail({ gmail_remove_dots: false }).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/signup");
    }

    try {
        const existingUser = await Landlord.findOne({ email: req.body.email });
        if (existingUser) {
            req.flash("errors", { msg: "Account with that email address already exists. If that email is yours, try signing in." });
            return res.redirect("/signup");
        }

        const user = new Landlord({
            email: req.body.email.toLowerCase(), // Make it lowercase in database.
            password: req.body.password
        });

        await user.save();
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", { msg: "You should be signed in now, check the navigation bar at the top of this page for your email: " + req.body.email.toLowerCase() + " . If you are signed in, you can now list an apartment. If you aren't signed in, please click on \"Landlord's Login\" and sign in." });
            res.redirect("/");
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * Profile page.
 * @route GET /account
 */
export const getAccount = (req: Request, res: Response): void => {
    const user = req.user as LandlordDocument;
    let apartments: ApartmentType[] = user.apartments;
    if(typeof apartments != "undefined" && apartments != null) {
        // it's good
    } else {
        // Set it to empty array
        apartments = [];
    }
    const listings: number[]  = apartments.map( (apartment: ApartmentType) => apartment.apartmentNumber );
    res.render("account/profile", {
        title: "Landlord's Account Page",
        listings: listings
    });
};

// Commented this out so users can't update their profile.
/**
 * Update profile information.
 * @route POST /account/profile
 */
/*
export const postUpdateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("email", "Please enter a valid email address.").isEmail().run(req);
    await body("email").normalizeEmail({ gmail_remove_dots: false }).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/account");
    }

    const user = req.user as UserDocument;
    User.findById(user.id, (err: NativeError, user: UserDocument) => {
        if (err) { return next(err); }
        user.email = req.body.email || "";
        user.profile.name = req.body.name || "";
        user.profile.gender = req.body.gender || "";
        user.profile.location = req.body.location || "";
        user.profile.website = req.body.website || "";
        user.save((err: WriteError & CallbackError) => {
            if (err) {
                if (err.code === 11000) {
                    req.flash("errors", { msg: "The email address you have entered is already associated with an account." });
                    return res.redirect("/account");
                }
                return next(err);
            }
            req.flash("success", { msg: "Profile information has been updated." });
            res.redirect("/account");
        });
    });
};
*/

/**
 * Update current password.
 * @route POST /account/password
 */
export const postUpdatePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("password", "Password must be at least 4 characters long").isLength({ min: 4 }).run(req);
    await check("confirmPassword", "Passwords do not match").equals(req.body.password).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/account");
    }

    const user = req.user as LandlordDocument;
    try {
        const userId = (user as any).id || (user as any)._id;
        const landlord = await Landlord.findById(userId);
        if (!landlord) {
            return res.redirect("/login");
        }
        landlord.password = req.body.password;
        await landlord.save();
        req.flash("success", { msg: "Password has been changed." });
        res.redirect("/account");
    } catch (err) {
        return next(err);
    }
};

/**
 * Delete user account.
 * @route POST /account/delete
 */
export const postDeleteAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as LandlordDocument;
    try {
        const apartments = await Apartment.find({ landlordEmail: user.email });
        if (apartments && Array.isArray(apartments) && apartments.length > 0) {
            for (const apartment of apartments) {
                await ApartmentBookings.deleteMany({ apartmentNumber: apartment.apartmentNumber });
            }
        }
        await Apartment.deleteMany({ landlordEmail: user.email });
        const userId = (user as any).id || (user as any)._id;
        await Landlord.deleteOne({ _id: userId });
        req.logout((err) => {
            if (err) { return next(err); }
            req.flash("success", { msg: "Your account has been deleted along with your apartments and their bookings." });
            res.redirect("/");
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * Unlink OAuth provider.
 * @route GET /account/unlink/:provider
 */
export const getOauthUnlink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const provider = String(req.params.provider);
    const user = req.user as LandlordDocument;
    try {
        const userId = (user as any).id || (user as any)._id;
        const landlord = await Landlord.findById(userId);
        if (landlord) {
            (landlord as any)[provider] = undefined;
            landlord.tokens = landlord.tokens.filter((token: AuthToken) => token.kind !== provider);
            await landlord.save();
            req.flash("info", { msg: `${provider} account has been unlinked.` });
        }
        res.redirect("/account");
    } catch (err) {
        return next(err);
    }
};

/**
 * Reset Password page.
 * @route GET /reset/:token
 */
export const getReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user) {
        return res.redirect("/");
    }
    try {
        const user = await Landlord
            .findOne({ passwordResetToken: req.params.token })
            .where("passwordResetExpires").gt(Date.now());
        if (!user) {
            req.flash("errors", { msg: "Password reset token is invalid or has expired." });
            return res.redirect("/forgot");
        }
        res.render("account/reset", {
            title: "Password Reset"
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * Helper to create Nodemailer transporter from environment variables.
 * Supports:
 * 1. Custom SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)
 * 2. SendGrid (SENDGRID_API_KEY)
 * 3. Gmail / Other service (EMAIL_USER, EMAIL_PASS / EMAIL_PASSWORD, optional EMAIL_SERVICE)
 */
const createMailTransporter = () => {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    } else if (process.env.SENDGRID_API_KEY) {
        return nodemailer.createTransport({
            service: "SendGrid",
            auth: {
                user: "apikey",
                pass: process.env.SENDGRID_API_KEY
            }
        });
    } else if (process.env.SENDGRID_USER && process.env.SENDGRID_PASSWORD) {
        return nodemailer.createTransport({
            service: "SendGrid",
            auth: {
                user: process.env.SENDGRID_USER,
                pass: process.env.SENDGRID_PASSWORD
            }
        });
    } else if (
        process.env.EMAIL_USER &&
        (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD) &&
        !String(process.env.EMAIL_PASS).includes("your_16_digit") &&
        !String(process.env.EMAIL_PASSWORD).includes("your_16_digit")
    ) {
        const emailUser = (process.env.EMAIL_USER || "").trim();
        const emailPass = (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || "").replace(/\s+/g, "");
        return nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || "gmail",
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });
    }
    return null;
};

/**
 * Process the reset password request.
 * @route POST /reset/:token
 */
export const postReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("password", "Password must be at least 4 characters long.").isLength({ min: 4 }).run(req);
    await check("confirm", "Passwords must match.").equals(req.body.password).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("back");
    }

    try {
        const user = await Landlord
            .findOne({ passwordResetToken: req.params.token })
            .where("passwordResetExpires").gt(Date.now());

        if (!user) {
            req.flash("errors", { msg: "Password reset token is invalid or has expired. Consider making a new password reset." });
            return res.redirect("back");
        }

        user.password = req.body.password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        const transporter = createMailTransporter();
        if (transporter) {
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_FROM || (process.env.EMAIL_USER ? `Sea Air Towers <${process.env.EMAIL_USER}>` : "no-reply@seaairtowers.com"),
                subject: "Your Sea Air Towers password has been changed",
                text: `Hello,\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                        <h2 style="color: #2c3e50; margin-top: 0;">Sea Air Towers</h2>
                        <p style="color: #555555; font-size: 15px; line-height: 1.5;">Hello,</p>
                        <p style="color: #555555; font-size: 15px; line-height: 1.5;">
                            This is a confirmation that the password for your account (<strong>${user.email}</strong>) has just been successfully changed.
                        </p>
                        <p style="color: #999999; font-size: 12px; margin-top: 30px;">
                            If you did not perform this change, please contact support immediately.
                        </p>
                    </div>
                `
            };
            transporter.sendMail(mailOptions).catch(err => {
                console.error("[Nodemailer] Error sending password reset confirmation email:", err);
            });
        }

        req.logIn(user, (err) => {
            if (err) { return next(err); }
            req.flash("success", { msg: "Success! Your password has been changed." });
            res.redirect("/");
        });
    } catch (err) {
        return next(err);
    }
};

/**
 * Forgot Password page.
 * @route GET /forgot
 */
export const getForgot = (req: Request, res: Response): void => {
    if (req.user) {
        return res.redirect("/");
    }
    res.render("account/forgot", {
        title: "Forgot Password"
    });
};

/**
 * Create a random token, then send user an email with a reset link using Nodemailer.
 * @route POST /forgot
 */
export const postForgot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await check("email", "Please enter a valid email address.").isEmail().run(req);
    await body("email").normalizeEmail({ gmail_remove_dots: false }).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/forgot");
    }

    try {
        const token = crypto.randomBytes(20).toString("hex");
        const user = await Landlord.findOne({ email: req.body.email });
        if (!user) {
            req.flash("errors", { msg: "Account with that email address does not exist." });
            return res.redirect("/forgot");
        }

        user.passwordResetToken = token;
        user.passwordResetExpires = new Date(Date.now() + 900000); // 15 minutes
        await user.save();

        const resetUrl = `${req.protocol}://${req.get("host")}/reset/${token}`;
        let transporter = createMailTransporter();
        let isEthereal = false;

        if (!transporter) {
            try {
                const testAccount = await nodemailer.createTestAccount();
                transporter = nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass
                    }
                });
                isEthereal = true;
            } catch (etherealErr) {
                // Ethereal creation failed (e.g. offline), fall back to console
            }
        }

        if (transporter) {
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_FROM || (process.env.EMAIL_USER ? `Sea Air Towers <${process.env.EMAIL_USER}>` : "no-reply@seaairtowers.com"),
                subject: "Reset your password on Sea Air Towers",
                text: `You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n` +
                      `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                      `${resetUrl}\n\n` +
                      `WARNING: Please only click "Reset Password" one time or the password reset link will be invalidated.\n\n` +
                      `This reset link will expire in 15 minutes.\n\n` +
                      `If you did not request this, please ignore this email and your password will remain unchanged.\n`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                        <h2 style="color: #2c3e50; margin-top: 0;">Sea Air Towers</h2>
                        <h4 style="color: #333333;">Password Reset Verification</h4>
                        <p style="color: #555555; font-size: 15px; line-height: 1.5;">
                            You are receiving this email because a password reset request was submitted for your account (<strong>${user.email}</strong>).
                        </p>
                        <p style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" style="background-color: #007bff; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">Reset Password</a>
                        </p>
                        <div style="background-color: #fff3cd; color: #856404; padding: 12px 16px; border-radius: 6px; margin: 20px 0; font-size: 13px; border: 1px solid #ffeeba; text-align: left;">
                            <strong>⚠️ Warning:</strong> Please only click <strong>"Reset Password"</strong> one time or the password reset link will be invalidated.
                        </div>
                        <p style="color: #666666; font-size: 14px; line-height: 1.5;">
                            Or copy and paste this verification link into your browser:
                        </p>
                        <p style="word-break: break-all; font-size: 13px; color: #007bff;">
                            <a href="${resetUrl}">${resetUrl}</a>
                        </p>
                        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 25px 0;">
                        <p style="color: #999999; font-size: 12px; margin-bottom: 0;">
                            Note: This reset link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.
                        </p>
                    </div>
                `
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`[Nodemailer] Password reset email successfully sent to: ${user.email}`);

                if (isEthereal) {
                    const previewUrl = nodemailer.getTestMessageUrl(info);
                    console.log("\n========================================================");
                    console.log("[NODEMAILER TEST EMAIL INBOX PREVIEW]");
                    console.log(`Open in Browser to SEE the EMAIL: ${previewUrl}`);
                    console.log(`Direct Reset URL: ${resetUrl}`);
                    console.log("========================================================\n");

                    req.flash("info", { msg: `An e-mail has been sent to ${user.email} with instructions to reset your password. (Please also check your Spam or Junk folder).` });
                    if (previewUrl) {
                        req.flash("success", { msg: `[Open Email in Browser]: ${previewUrl}` });
                    } else {
                        req.flash("success", { msg: `[Dev Mode] Reset Link: ${resetUrl}` });
                    }
                    return res.redirect("/forgot");
                }

                req.flash("info", { msg: `An e-mail has been sent to ${user.email} with further instructions to reset your password. (Please also check your Spam or Junk folder).` });
                return res.redirect("/forgot");
            } catch (mailErr: any) {
                console.error("[Nodemailer Error] Failed to send email:", mailErr);
                req.flash("info", { msg: `An e-mail has been sent to ${user.email} with instructions to reset your password. (Please also check your Spam or Junk folder).` });
                req.flash("success", { msg: `[Dev Mode] Reset Link: ${resetUrl}` });
                return res.redirect("/forgot");
            }
        } else {
            console.log("\n========================================================");
            console.log("[NODEMAILER RESET LINK]");
            console.log(`User: ${user.email}`);
            console.log(`Reset URL: ${resetUrl}`);
            console.log("========================================================\n");

            req.flash("info", { msg: `An e-mail has been sent to ${user.email} with instructions to reset your password. (Please also check your Spam or Junk folder).` });
            req.flash("success", { msg: `[Dev Mode] Reset Link: ${resetUrl}` });
            return res.redirect("/forgot");
        }
    } catch (err) {
        return next(err);
    }
};
