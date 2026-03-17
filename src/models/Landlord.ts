import bcrypt from "bcrypt";
import crypto from "crypto";
import mongoose from "mongoose";

export type LandlordDocument = mongoose.Document & {
    email: string;
    password: string;
    passwordResetToken: string;
    passwordResetExpires: Date;
    tokens: AuthToken[];
    apartments: ApartmentType[];
    profile: {
        name: string;
        gender: string;
        location: string;
        website: string;
        picture: string;
    };
    comparePassword: (candidatePassword: string, cb: (err: any, isMatch?: boolean) => void) => void;
    gravatar: (size: number) => string;
};

export interface AuthToken {
    accessToken: string;
    kind: string;
}

export interface ApartmentType {
    apartmentNumber: number;
}

const landlordSchema = new mongoose.Schema<LandlordDocument>(
    {
        email: { type: String, unique: true },
        password: String,
        passwordResetToken: String,
        passwordResetExpires: Date,
        tokens: Array,
        apartments: Array,
        profile: {
            name: String,
            gender: String,
            location: String,
            website: String,
            picture: String
        }
    },
    { timestamps: true },
);

/**
 * cache the password hash for the landlord, so that we don't have to re-hash it every time
 */
landlordSchema.pre("save", async function() {
    const landlord = this as LandlordDocument;

    if (!landlord.isModified("password")) {
        return;
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(landlord.password, salt);
        landlord.password = hash;
    } catch (err) {
        throw err;
    }
});

/**
 * Helper method for validating user's password. We use bcrypt to compare the submitted password with the hashed password stored in the database.
 */
landlordSchema.methods.comparePassword = function (candidatePassword: string, cb: (err: any, isMatch?: boolean) => void) {
    bcrypt.compare(candidatePassword, this.password)
        .then(isMatch => cb(null, isMatch))
        .catch(err => cb(err));
};

/**
 * Helper method for getting user's gravatar. We use their email address to generate a gravatar URL, optionally with a size parameter (defaulting to 200). If they don't have an email address, we return the default gravatar URL.npm run build
 */
landlordSchema.methods.gravatar = function (size: number = 200) {
    if (!this.email) {
        return `https://gravatar.com/avatar/?s=${size}&d=retro`;
    }
    const md5 = crypto.createHash("md5").update(this.email).digest("hex");
    return `https://gravatar.com/avatar/${md5}?s=${size}&d=retro`;
};

export const Landlord = mongoose.model<LandlordDocument>("Landlord", landlordSchema);