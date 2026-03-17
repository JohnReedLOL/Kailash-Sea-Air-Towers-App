"use strict";

import async from "async";
import crypto from "crypto";
// Commenting this out because email sender is broken.
// import nodemailer from "nodemailer";
import passport from "passport";
import { ApartmentType, Landlord, LandlordDocument, AuthToken } from "../models/Landlord";
import { Apartment, ApartmentDocument } from "../models/Apartment";
import { ApartmentBookings, ApartmentBookingsDocument } from "../models/ApartmentBookings";
import { Request, Response, NextFunction } from "express";
import { IVerifyOptions } from "passport-local";
import { WriteError } from "mongodb";
import { body, check, validationResult } from "express-validator";
import "../config/passport";

//// if you want to use the Facebook strategy, you will need to import the User model as well, since the Facebook strategy references it in the code.
// import { User, UserDocument } from '../models/User';
// If the Facebook strategy is not used → delete the above line completely. If it is used in types → replace with: import { CallbackError } from "mongoose";
import { CallbackError } from "mongoose";

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
export const logout = (req: Request, res: Response, next: NextFunction) => { 
    req.logout((err) => {
    if (err) return next(err);
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
    //validation through express-validator
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
        // search for an existing user with the same email
        const existingUser = await Landlord.findOne({ email: req.body.email.toLowerCase() });

        if (existingUser) {
            req.flash("errors", { msg: "Account with that email address already exists." });
            return res.redirect("/signup");
        }

        // creation and saving of the new user through await
        const user = new Landlord({
            email: req.body.email.toLowerCase(),
            password: req.body.password
        });

        await user.save(); // no more callback 

        // login after signup
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", { 
                msg: "You should be signed in now, check the navigation bar, " + req.body.email.toLowerCase() 
            });
            return res.redirect("/");
        });

    } catch (err) {
        // All DB errors will be handled here
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
        const landlord = await Landlord.findById((user as any)._id);
        
        if (!landlord) {
            req.flash("errors", { msg: "Landlord not found" });
            return res.redirect("/account");
        }
        // Since the password hash middleware is set to run before saving a landlord, we can just set the password to the new one and then save the landlord, which will trigger the middleware to hash the new password before saving it to the database.
        landlord.password = req.body.password;

        await landlord.save(); 
        
        req.flash("success", { msg: "Password has been changed." });
        res.redirect("/account");
    
        }   catch (err) {
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
        // 1. Find all apartments belonging to this landlord
        const apartments = await Apartment.find({ landlordEmail: user.email });

        // 2. If apartments exist, delete bookings for each one
        if (apartments && apartments.length > 0) {
            for (const apartment of apartments) {
                // We use a loop with await to ensure deletions finish before moving on
                await ApartmentBookings.deleteMany({ 
                    apartmentNumber: (apartment as any).apartmentNumber 
                });
            }
            console.log("All associated bookings deleted.");
        }

        // 3. Delete all apartments under this landlord's email
        await Apartment.deleteMany({ landlordEmail: user.email });
        console.log("Apartments deleted.");

        // 4. Delete the landlord account itself
        await Landlord.deleteOne({ _id: (user as any)._id });
        console.log("Landlord account deleted.");

        // 5. Log out the user and redirect to home page
        req.logout((err) => {
            if (err) return next(err);
            req.flash("success", { msg: "Your account has been deleted along with your apartments and their bookings." });
            res.redirect("/");
        });

    } catch (error) {
        // Catch any database or execution errors and pass them to the error handler
        console.error("Error during account deletion:", error);
        return next(error);
    }
};

// End of postDeleteAccount function
/**
 * Unlink OAuth provider.
 * @route GET /account/unlink/:provider
 */
export const getOauthUnlink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const provider = req.params.provider;
    const user = req.user as LandlordDocument;

    try {
        const landlord = await Landlord.findById((user as any)._id);
        const provider = req.params.provider as string;
        if (!landlord) {
            req.flash("errors", { msg: "Landlord not found." });
            return res.redirect("/account");
        }
        (landlord as any)[provider] = undefined;
        
        landlord.tokens = landlord.tokens.filter((token: AuthToken) => token.kind !== provider);

        await landlord.save();

        req.flash("info", { msg: `${provider} account has been unlinked.` });
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
    try {
        const landlord = await Landlord.findOne({ passwordResetToken: req.params.token })
            .where("passwordResetExpires").gt(Date.now())
            .exec();

        if (!landlord) {
            req.flash("errors", { msg: "Password reset token is invalid or has expired." });
            return res.redirect("/forgot");
        }
        res.render("account/reset", { title: "Password Reset" });
    } catch (err) {
        return next(err);
    }
};

/**
 * Process the reset password request.
 * @route POST /reset/:token
 */
        // Commenting this out because the email sender is broken
        /*
        function sendResetPasswordEmail(user: LandlordDocument, done: (err: Error) => void) {
            const transporter = nodemailer.createTransport({
                service: "SendGrid",
                auth: {
                    user: process.env.SENDGRID_USER,
                    pass: process.env.SENDGRID_PASSWORD
                }
            });
            const mailOptions = {
                to: user.email,
                from: "express-ts@starter.com",
                subject: "Your password has been changed",
                text: `Hello,\n\nThis is a confirmation that the password for your account ${user.email} has just been changed.\n`
            };
            transporter.sendMail(mailOptions, (err) => {
                req.flash("success", { msg: "Success! Your password has been changed." });
                done(err);
            });
        }
        */
        // I'm keeping the name sendResetPasswordEmail but it no longer sends the email because the email sender is broken. Now it just says a success message.
export const postReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Validation
    await check("password", "Password must be at least 4 characters long.").isLength({ min: 4 }).run(req);
    await check("confirm", "Passwords must match.").equals(req.body.password).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("back");
    }

    try {
        // 2. Find landlord by token and check expiration
        const landlord = await Landlord.findOne({ passwordResetToken: req.params.token })
            .where("passwordResetExpires").gt(Date.now())
            .exec();

        if (!landlord) {
            req.flash("errors", { msg: "Password reset token is invalid or has expired." });
            return res.redirect("back");
        }

        // 3. Update password and clear reset fields
        landlord.password = req.body.password;
        landlord.passwordResetToken = undefined;
        landlord.passwordResetExpires = undefined;

        await landlord.save();

        // 4. Log in the user after password reset
        req.logIn(landlord, (err) => {
            if (err) return next(err);
            
            // 5. Here you can add your email notification logic if needed
            req.flash("success", { msg: "Success! Your password has been changed." });
            res.redirect("/");
        });

    } catch (err) {
        return next(err);
    }
}; 
/**
 * Create a random token, then the send user an email with a reset link.
 *
 * Edit: This no longer sends email because the email sender stopped working, but the user can still change their password.
 * Now this request just redirects the user to a password change page, the same page they would have gone to if they clicked the link in the email that used to be sent when the email sender was working.
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
        // 1. Create random token
        const token = crypto.randomBytes(16).toString("hex");

        // 2. Find landlord by email
        const user = await Landlord.findOne({ email: req.body.email.toLowerCase() });

        if (!user) {
            req.flash("errors", { msg: "Account with that email address does not exist." });
            return res.redirect("/forgot");
        }

        // 3. Set random token and expiration (1 hour)
        user.passwordResetToken = token;
        user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour

        await user.save();

        // 4. Send Forgot Password Email (Broken sender logic replaced by redirect)
        /*
        const transporter = nodemailer.createTransport({
            service: "SendGrid",
            auth: {
                user: process.env.SENDGRID_USER,
                pass: process.env.SENDGRID_PASSWORD
            }
        });
        const mailOptions = {
            to: user.email,
            from: "hackathon@starter.com",
            subject: "Reset your password on Hackathon Starter",
            text: `You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n
            Please click on the following link, or paste this into your browser to complete the process:\n\n
            http://${req.headers.host}/reset/${token}\n\n
            If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };
        await transporter.sendMail(mailOptions);
        req.flash("info", { msg: `An e-mail has been sent to ${user.email} with further instructions.` });
        */

        // I'm keeping the name sendForgetPasswordEmail but it no longer sends the email because the email sender is broken. 
        // Now it just reroutes to the password reset page.
        // Commenting this out because even though it was what was used before, it is insecure due to http instead of https.
        // return res.redirect(`http://${req.headers.host}/reset/${token}`);
        
        return res.redirect(`/reset/${token}`);

    } catch (err) {
        // Catch any errors that occurred during the process
        return next(err);
    }
};