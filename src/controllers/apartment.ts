"use strict";

// I don't know if these all are necessary - I just copied them from user.ts
import async from "async";
import { Apartment, ApartmentDocument } from "../models/Apartment";
import { ApartmentBookings, ApartmentBookingsDocument } from "../models/ApartmentBookings";
import { Landlord, LandlordDocument } from "../models/Landlord";
import { Request, Response, NextFunction } from "express";
import { check, validationResult } from "express-validator";
import "../config/passport";
// if you want to use the Facebook strategy, you will need to import the User model as well, since the Facebook strategy references it in the code.
//import { reduce } from "bluebird";

const addDaysToDate = (startDate: Date, days: number) => {
    const date = new Date(startDate.valueOf());
    date.setDate(date.getDate() + days);
    return date;
};

const getDates = (startDate: Date, stopDate: Date) => {
    const dateArray: Date[] = [];
    let currentDate = startDate;
    while (currentDate <= stopDate) {
        dateArray.push(new Date (currentDate));
        currentDate = addDaysToDate(currentDate, 1);
    }
    return dateArray;
};

// Make sure each date range looks like "MM/DD/YYYY - MM/DD/YYYY"
const validateDateRange = (dateRange: string) => {
    const splitDateRange = dateRange.split("-");

    // Make sure date range has exactly one "-"
    if(splitDateRange.length != 2) {
        return false;
    }

    const dateOneString = splitDateRange[0].trim();
    const dateTwoString = splitDateRange[1].trim();

    // Make sure each date looks like "MM/DD/YYYY"
    const validateDate = (dateString: string) => {
        const dateStringSplit: string[] = dateString.split("/");
        if(dateStringSplit.length != 3) {
            return false;
        } else {
            // Make sure these are all numbers. Sorry for the ugly casing
            if( isNaN(dateStringSplit[0] as unknown as number)
                || isNaN(dateStringSplit[1] as unknown as number)
                || isNaN(dateStringSplit[2] as unknown as number) ) {
                return false;
            }
            const month = parseInt(dateStringSplit[0], 10);
            const day = parseInt(dateStringSplit[1], 10);
            const year = parseInt(dateStringSplit[2], 10);
            if(! (month >= 1 && month <= 12) ) {
                return false;
            }
            if(! (day >= 1 && day <= 31) ) {
                return false;
            }
            if(! (year >= 1000) ) {
                return false;
            }
        }
        return true;
    };

    const dateOneValid: boolean = validateDate(dateOneString);
    const dateTwoValid: boolean = validateDate(dateTwoString);
    if(dateOneValid && dateTwoValid) {
        return true;
    } else {
        return false;
    }
};

// Make sure prices look like "$N" or "N" where N is a number.
const validatePrice = (price: string) => {
    const priceTrimmed = price.trim().replace(/,/g, ""); // Commas are stripped before validation and parsing.
    let priceNumber = priceTrimmed;
    // Remove the leading dollar sign.
    if(priceNumber.charAt(0) === "$") {
        priceNumber = priceNumber.substr(1);
    }
    // Make sure that the price is a number.
    if( isNaN(priceNumber as unknown as number) ) {
        return false;
    }
    return true;
};

const validateHttpOrHttps = (link: string) => {
    const lowercaseLink = link.trim().toLowerCase();
    if(lowercaseLink.startsWith("http") || lowercaseLink.startsWith("https") ) {
        return true;
    } else {
        return false;
    }
};

// Make sure the link contains a dot.
const validateLink = (link: string) => {
    const linkTrimmed = link.trim();
    if(! linkTrimmed.includes(".") ) {
        return false;
    }

    const urlSplit: string[] = linkTrimmed.split(".");
    // Make sure there is a character after the dot (ex .com, .net, etc)
    for(let i = 0; i < urlSplit.length; ++i) {
        const urlPortion = urlSplit[i];
        if(urlPortion.length < 1) {
            return false;
        }
    }

    return true;
};

/**
 * POST /search-for-apartments
 * This does the actual searching for apartments in the database
 */
export const postSearchForApartments = async (req: Request, res: Response, next: NextFunction) => {
    await check("numBedrooms", "Minimum number of bedrooms must be a number (without commas).").exists().isNumeric().run(req);
    await check("numBedroomsMax", "Maximum number of bedrooms must be a number (without commas).").exists().isNumeric().run(req);
    await check("numBathrooms", "Number of bathrooms must be a number (without commas).").exists().isNumeric().run(req);
    await check("dateRange", "Date range must be in format: MM/DD/YYYY - MM/DD/YYYY.").exists().custom( (dateRange: string) => {
        return validateDateRange(dateRange);
    }).run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/search-for-apartments");
    }

    const numBedrooms = parseFloat(req.body.numBedrooms);
    const numBedroomsMax = parseFloat(req.body.numBedroomsMax);
    const numBathrooms = parseFloat(req.body.numBathrooms);
    const dateRange = req.body.dateRange;
    const splitDateRange = dateRange.split("-");
    const dateOneString = splitDateRange[0].trim();
    const dateTwoString = splitDateRange[1].trim();
    const firstDate = new Date(dateOneString);
    const secondDate = new Date(dateTwoString);

    if(firstDate.getTime() > secondDate.getTime()) {
        const errorBody = "Your first date (" + firstDate.toDateString() + ") is greater than your second date (" + secondDate.toDateString() + "). Hit the back button and try again.";
        return res.render("error", {
            errorBody: errorBody
        });
    }

    const bookedDates: Date[]  = getDates(firstDate, secondDate);
    const bookedDatesTimes = new Set();
    for(let i = 0; i < bookedDates.length; ++i) {
        const bookedDate: Date = bookedDates[i];
        bookedDatesTimes.add(bookedDate.getTime());
    }
    // We are no longer filtering by price in a given month
    // const monthPrice = req.body.monthPrice.split(" ");
    // const month = monthPrice[0].trim().toLowerCase();
    // let price = monthPrice[1].trim();
    // if(price.charAt(0) == "$") {
    //     price = price.substr(1);
    // }
    // const monthVariable = month + "Price";
    // Filter by numBathrooms, numBedrooms, and price for a given month now. Filter by dates booked later.

    /*
const ids = ['id1', 'id2', 'id3'];
const usersWithIds = await User.find({ '_id': { $in: ids } });
    */

try {
  let myApartments = await Apartment.find({
    numBathrooms: { $gte: numBathrooms },
    numBedrooms: { $gte: numBedrooms, $lte: numBedroomsMax },
  });

  const myApartmentNumbers = myApartments.map(a => a.apartmentNumber);

  const bookings = await ApartmentBookings.find({
    apartmentNumber: { $in: myApartmentNumbers }
  });

  for (const booking of bookings) {
    const bookingDate: Date = booking.eveningBooked;

    if (bookedDatesTimes.has(bookingDate.getTime())) {
      myApartments = myApartments.filter(
        a => a.apartmentNumber !== booking.apartmentNumber
      );
    }
  }

  const myNonBookedApartments: ApartmentDocument[] =
    myApartments.sort((a, b) => b.apartmentNumber - a.apartmentNumber);

  return res.render("apartment/apartmentsThatMatchSearch", {
    title: "Apartments That Match Your Search",
    myApartments: myNonBookedApartments
  });

} catch (err) {
  return next(err);
}
};
/**
 * GET /search-for-apartments
 * Page to let users search for apartments
 */
export const searchForApartments = (req: Request, res: Response) => {
    res.render("apartment/search", {
        title: "Search For Apartment"
    });
};

/**
 * POST /account/edit-listing/:apartmentNumber
 * Call to update listing for an apartment.
 */
// Updated to handle commas in prices (e.g., "$1,200" or "1,200")
export const postUpdateApartmentListing = async (req: Request, res: Response, next: NextFunction) => {
   const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);
    await check("numBedrooms", "Number of bedrooms must be a number (without commas).").exists().isNumeric().run(req);
    await check("numBathrooms", "Number of bathrooms must be a number (without commas).").exists().isNumeric().run(req);

    await check("photosFolder", "Photos link must be a valid link.").exists().custom( (url: string) => {
        return validateLink(url);
    }).run(req);
    await check("photosFolder", "Photos link must start with \"http\" or \"https\".").exists().custom( (url: string) => {
        return validateHttpOrHttps(url);
    }).run(req);

    await check("januaryPrice", "January's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("februaryPrice", "February's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("marchPrice", "March's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("aprilPrice", "April's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("mayPrice", "May's rent must be a number (e.g., 1200 or 1,200s).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("junePrice", "June's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("julyPrice", "July's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("augustPrice", "August's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("septemberPrice", "September's rent must be a number (e.g., 1200 or 1,200s).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("octoberPrice", "October's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("novemberPrice", "November's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("decemberPrice", "December's rent must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    if(req.body.forSalePrice == null || req.body.forSalePrice == undefined
       || req.body.forSalePrice == "") {
        req.body.forSalePrice = "0";
    }
    await check("forSalePrice", "For sale price must be a number (e.g., 1200 or 1,200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/account/edit-listing/" + apartmentNumber);
    }

    // The .replace(/[$,]/g, "") removes both dollar signs and commas before parsing to float.
    // This ensures consistent handling of input prices across all fields.

    const filter = { apartmentNumber: apartmentNumber };
    const user = req.user as LandlordDocument;
    const update = {
        landlordEmail: user.email.trim().toLowerCase(),
        numBedrooms: parseFloat(req.body.numBedrooms.trim()),
        numBathrooms: parseFloat(req.body.numBathrooms.trim()),
        photosFolder: req.body.photosFolder.trim(),
        januaryPrice: parseFloat(req.body.januaryPrice.trim().replace(/[$,]/g, "")), // ignore the dollar sign
        februaryPrice: parseFloat(req.body.februaryPrice.trim().replace(/[$,]/g, "")),
        marchPrice: parseFloat(req.body.marchPrice.trim().replace(/[$,]/g, "")),      
        aprilPrice: parseFloat(req.body.aprilPrice.trim().replace(/[$,]/g, "")),
        mayPrice: parseFloat(req.body.mayPrice.trim().replace(/[$,]/g, "")),
        junePrice: parseFloat(req.body.junePrice.trim().replace(/[$,]/g, "")),
        julyPrice: parseFloat(req.body.julyPrice.trim().replace(/[$,]/g, "")),
        augustPrice: parseFloat(req.body.augustPrice.trim().replace(/[$,]/g, "")),
        septemberPrice: parseFloat(req.body.septemberPrice.trim().replace(/[$,]/g, "")),
        octoberPrice: parseFloat(req.body.octoberPrice.trim().replace(/[$,]/g, "")),
        novemberPrice: parseFloat(req.body.novemberPrice.trim().replace(/[$,]/g, "")),
        decemberPrice: parseFloat(req.body.decemberPrice.trim().replace(/[$,]/g, "")),
        additionalInformation: req.body.additionalInformation,
        forSalePrice: parseFloat(req.body.forSalePrice.trim().replace(/[$,]/g, ""))
    };

    // I'm starting to get an error here after moving this code to the new version so I'm commenting this out and re-writing it.
    /*
    Apartment.findOneAndUpdate(filter, update, (err, doc: any) => {
        if (err) { return next(err); }
        req.flash("success", { msg: "Success! Your listing has been updated." });
        res.redirect("/apartment/" + apartmentNumber);
    });
    */
   // Using findOneAndUpdate according to https://www.geeksforgeeks.org/mongoose-findoneandupdate-function/
   /*
   Apartment.findOneAndUpdate( filter,
    update, null, (err, docs) => {
    if (err){
        console.log(err);
        return next(err);
    }
    else{
        console.log("Original Doc : ",docs);
        req.flash("success", { msg: "Success! Your listing has been updated." });
        res.redirect("/apartment/" + apartmentNumber);
    }
});
*/
    // Correcting deprecation warning according to https://stackoverflow.com/questions/52572852/deprecationwarning-collection-findandmodify-is-deprecated-use-findoneandupdate
    // await ModelName.findOneAndUpdate({matchQuery}, {$set: updateData}, {useFindAndModify: false});

try {
    const docs = await Apartment.findOneAndUpdate(filter, update, { new: true, useFindAndModify: false });
    console.log("Original Doc : ", docs);
    req.flash("success", { msg: "Success! Your listing has been updated." });
    res.redirect("/apartment/" + apartmentNumber);
} catch (err) {
    console.log(err);
    return next(err);
}
};
/**
 * GET /account/edit-listing/:apartmentNumber
 * Page to update listing for an apartment.
 */
/**
 * GET /account/update-listing/:apartmentNumber
 * Update the details of an apartment listing.
 */
export const getUpdateApartmentListing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);

        if (isNaN(apartmentNumber)) {
            req.flash("errors", { msg: "Invalid apartment number." });
            return res.redirect("/account");
        }

        // 1. Search for the apartment using await (No more callbacks!)
        const apartment = await Apartment.findOne({ apartmentNumber: apartmentNumber }).exec();

        if (!apartment) {
            req.flash("errors", { msg: `Apartment #${apartmentNumber} not found.` });
            return res.redirect("/account");
        }

        // 2. Render the update page with the found data
        res.render("apartment/update", {
            title: "Update Listing For Apartment #" + apartmentNumber,
            apartmentNumber: apartmentNumber,
            apartment: apartment
        });
    } catch (err) {
        // If something goes wrong, pass it to the error handler
        return next(err);
    }
};

/**
 * GET /account/update-availability/:apartmentNumber
 * Book dates for an apartment.
 */
export const updateApartmentAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);

    if (isNaN(apartmentNumber)) {
        req.flash("errors", { msg: "Invalid apartment number." });
        return res.redirect("/account");
    }

    res.render("apartment/availability", {
        title: "Book Dates For Apartment #" + apartmentNumber,
        apartmentNumber: apartmentNumber
    });
};

/**
 * POST /account/update-availability/:apartmentNumber
 * Book dates for an apartment
 */
export const postUpdateApartmentAvailability = async (req: Request, res: Response, next: NextFunction) => {

    await check("dateRange", "Date range must be in format: MM/DD/YYYY - MM/DD/YYYY.").exists()
    .custom( (dateRange: string) => {
        return validateDateRange(dateRange);
    }).run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/account/update-availability/" + (req.params.apartmentNumber as string));
    }

    const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);
    const dateRange = req.body.dateRange;

    const splitDateRange = dateRange.split("-");
    const dateOneString = splitDateRange[0].trim();
    const dateTwoString = splitDateRange[1].trim();
    const firstDate = new Date(dateOneString);
    const secondDate = new Date(dateTwoString);

    if(firstDate.getTime() > secondDate.getTime()) {
        const errorBody = "Your first date (" + firstDate.toDateString() + ") is greater than your second date (" + secondDate.toDateString() + "). Hit the back button and try again.";
        return res.render("error", {
            errorBody: errorBody
        });
    }
    try {
        const dates: Date[] = getDates(firstDate, secondDate);
        const apartmentBookings = dates.map(date => ({
            apartmentNumber: apartmentNumber,
            eveningBooked: date
        }));

        await ApartmentBookings.create(apartmentBookings);
        
        return res.render("apartment/bookedDays", {
            title: "The Following Evenings Have Been Booked:",
            daysBooked: dates
        });
    } catch (err: any) {
        if (err.code === 11000) {
            req.flash("info", { msg: "You tried to book a day that was already booked. Your days were booked anyway." });
            return res.redirect("/account/update-availability/" + apartmentNumber);
        }
        return next(err);
    }
}; 
export const postBookApartment = async (req: Request, res: Response, next: NextFunction) => {
    const { firstDate, secondDate, apartmentNumber } = req.body;
    const dates: Date[]  = getDates(firstDate, secondDate);
    const apartmentBookings = [];
    for(let i = 0; i < dates.length; ++i) {
        apartmentBookings.push({apartmentNumber : apartmentNumber, eveningBooked: dates[i]});
    }
   try {
    const bookings = await ApartmentBookings.create(apartmentBookings);
    const daysBooked = bookings.map((booking: any) => booking.eveningBooked);
    return res.render("apartment/bookedDays", {
        title: "The Following Evenings Have Been Booked:",
        daysBooked: daysBooked
    });
} catch (err: any) {
    if (err.code === 11000) {
        req.flash("info", { msg: "You tried to book a day that was already booked." });
    } else {
        return next(err);
    }
}
};
/**
 * POST /account/unupdate-availability/:apartmentNumber
 * Unbook dates for an apartment
 */
export const postUnUpdateApartmentAvailability = async (req: Request, res: Response, next: NextFunction) => {

    await check("dateRange2", "Date range must be in format: MM/DD/YYYY - MM/DD/YYYY.").exists()
    .custom( (dateRange: string) => {
        return validateDateRange(dateRange);
    }).run(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash("errors", errors.array());
        return res.redirect("/account/update-availability/" + req.params.apartmentNumber);
    }

    const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);

    const dateRange = req.body.dateRange2;
    const splitDateRange = dateRange.split("-");
    const dateOneString = splitDateRange[0].trim();
    const dateTwoString = splitDateRange[1].trim();
    const firstDate = new Date(dateOneString);
    const secondDate = new Date(dateTwoString);
    if(firstDate.getTime() > secondDate.getTime()) {
        const errorBody = "Your first date (" + firstDate.toDateString() + ") is greater than your second date (" + secondDate.toDateString() + "). Hit the back button and try again.";
        return res.render("error", {
            errorBody: errorBody
        });
    }

    const dates: Date[]  = getDates(firstDate, secondDate);
    // Commenting this out and replacing it to make it so I'm doing all my deleteMany's the same way.
    /*
    ApartmentBookings.deleteMany({ apartmentNumber : apartmentNumber, eveningBooked: { $in: dates} }, null, (err: any) => {
        if (err) { return next(err); }
        return res.render("apartment/unbookedDays", {
            title: "The Following Evenings Have Been Unbooked:",
            bookings: dates
        });
    });
    */
    ApartmentBookings.deleteMany({ apartmentNumber : apartmentNumber, eveningBooked: { $in: dates} }).then( () => {
        return res.render("apartment/unbookedDays", {
            title: "The Following Evenings Have Been Unbooked:",
            bookings: dates
        });
    }).catch( (error) => {
        if (error) { return next(error); }
    });
};

/**
 * GET /account/update-listing
 * See your listings to chose one to update.
 */
export const chooseListingToUpdate = async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as LandlordDocument;
    const landlordEMail = user.email.toLowerCase();
    // select only the Apartment's apartmentNumber.
try {
    const apartments = await Apartment.find({ landlordEmail: landlordEMail }, "apartmentNumber");
    res.render("apartment/pickApartmentToEdit", {
        title: "Pick An Apartment Number To Edit",
        apartments: apartments
    });
} catch (err) {
    return next(err);
}
};
/**
 * GET /account/update-listing/:apartmentNumber
 * Chose between updating the info for an apartment or updating its availability.
 *//**
 * GET /account/edit-listing/:apartmentNumber
 * show page to update listing for an apartment or update availability of an apartment.
 */
export const updateListing = (req: Request, res: Response) => {
    const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);

    if (isNaN(apartmentNumber)) {
        req.flash("errors", { msg: "Invalid apartment number." });
        return res.redirect("/account");
    }

    res.render("apartment/editListingOrAvailability", {
        title: `Update Listing Or Availability Of Apartment #${apartmentNumber}`,
        apartmentNumber: apartmentNumber
    });
};
/**
 * GET /apartment/:apartmentNumber
 * Listing page for an apartment.
 */
/**
 * GET /apartment/:apartmentNumber
 * View details of a specific apartment by its number.
 */
export const getApartment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const apartmentNumber = parseInt(req.params.apartmentNumber as string, 10);

        if (isNaN(apartmentNumber)) {
            req.flash("errors", { msg: "Invalid apartment number format." });
            return res.redirect("/");
        }

        // Use await instead of a callback to find the apartment
        const apartment = await Apartment.findOne({ apartmentNumber: apartmentNumber }).exec();

        if (!apartment) {
            req.flash("errors", { msg: `Apartment #${apartmentNumber} not found.` });
            return res.redirect("/");
        }

        res.render("apartment/getByNumber", {
            title: "Apartment Number " + apartmentNumber,
            apt: apartment
        });
    } catch (err) {
        // Pass any database errors to the error handler
        return next(err);
    }
};

/**
 * GET /rent-apartment-by-landlord
 * Form to fill in the landlord. If landlord is filled, list the apartments.
 * Note: This is no longer used - just do /search-for-apartments
 */
/*export const getRentApartmentByLandlord = (req: Request, res: Response, next: NextFunction) => {
    let landlord = req.query.landlord; // email address of landlord
    if(landlord == undefined) {
        res.render("apartment/getByLandlord", {
            title: "Get Apartments By Landlord"
        });
    } else {
        landlord = landlord.toLowerCase();
        // select only the Apartment's apartmentNumber.
        Apartment.find({ landlordEmail: landlord}, "apartmentNumber", (err, apartments: any) => {
            if (err) { return next(err); }
            res.render("apartment/apartmentsWithLandlord", {
                title: "Get Apartments By Landlord",
                landlordsEmail: landlord,
                apartments: apartments

            });
        });
    }
};*/

/**
 * GET /account/list-apartment
 * Page for a landlord to list an apartment.
 */
export const getCreateApartment = (req: Request, res: Response) => {
    res.render("apartment/create", {
        title: "List Apartment",
        apartment: {
            apartmentNumber: 0,
            numBedrooms: 0,
            numBathrooms: 0,
            photosFolder: "https://tinyurl.com/ra9kxgs",
            additionalInformation: "",
            januaryPrice: 0, // These don't need to be sent in - the form can just be filled with empty string.
            februaryPrice: 0,
            marchPrice: 0,
            aprilPrice: 0,
            mayPrice: 0,
            junePrice: 0,
            julyPrice: 0,
            augustPrice: 0,
            septemberPrice: 0,
            octoberPrice: 0,
            novemberPrice: 0,
            decemberPrice: 0,
            forSalePrice: 0
        }
    });
};

/**
 * POST /account/list-apartment
 * Create landlord's apartment.
 */
export const postCreateApartment = async (req: Request, res: Response, next: NextFunction) => {
    await check("apartmentNumber", "Apartment number must be a number (without commas).").exists().isNumeric().run(req);
    await check("numBedrooms", "Number of bedrooms must be a number (without commas).").exists().isNumeric().run(req);
    await check("numBathrooms", "Number of bathrooms must be a number (without commas).").exists().isNumeric().run(req);

    await check("photosFolder", "Photos link must be a valid link.").exists().custom( (url: string) => {
        return validateLink(url);
    }).run(req);
    await check("photosFolder", "Photos link must start with \"http\" or \"https\".").exists().custom( (url: string) => {
        return validateHttpOrHttps(url);
    }).run(req);

    await check("januaryPrice", "January's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("februaryPrice", "February's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("marchPrice", "March's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("aprilPrice", "April's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("mayPrice", "May's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("junePrice", "June's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("julyPrice", "July's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("augustPrice", "August's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("septemberPrice", "September's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("octoberPrice", "October's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("novemberPrice", "November's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("decemberPrice", "December's rent must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);
    await check("forSalePrice", "For sale price must be a number (e.g., 1200, 1,200, or $1200).").exists().custom( (price: string) => {
        return validatePrice(price);
    }).run(req);

    const errors = validationResult(req); // user local variable has .apartments: CoreMongoseArray(0)

    if (!errors.isEmpty()) { // apartment-number, april-price, etc stored in req.body
        req.flash("errors", errors.array());
        return res.redirect("/account/list-apartment");
    } // body.additional-information: "AdditionInfoRow1 111\r\nAdditionInfoRow2 222"

    // The .replace(/[$,]/g, "") removes both dollar signs and commas before parsing to float.
    const user = req.user as LandlordDocument;

    const apartment = new Apartment({
        apartmentNumber: parseInt(req.body.apartmentNumber, 10),
        landlordEmail: user.email.trim().toLowerCase(),
        numBedrooms: parseFloat(req.body.numBedrooms.trim()),
        numBathrooms: parseFloat(req.body.numBathrooms.trim()),
        photosFolder: req.body.photosFolder.trim(), // Link to photos of your apartment on Google Drive
        januaryPrice: parseFloat(req.body.januaryPrice.trim().replace(/[$,]/g, "")), // These don't need to be sent in - the form can just be filled with empty string.
        februaryPrice: parseFloat(req.body.februaryPrice.trim().replace(/[$,]/g, "")),
        marchPrice: parseFloat(req.body.marchPrice.trim().replace(/[$,]/g, "")),
        aprilPrice: parseFloat(req.body.aprilPrice.trim().replace(/[$,]/g, "")),
        mayPrice: parseFloat(req.body.mayPrice.trim().replace(/[$,]/g, "")),
        junePrice: parseFloat(req.body.junePrice.trim().replace(/[$,]/g, "")),
        julyPrice: parseFloat(req.body.julyPrice.trim().replace(/[$,]/g, "")),
        augustPrice: parseFloat(req.body.augustPrice.trim().replace(/[$,]/g, "")),
        septemberPrice: parseFloat(req.body.septemberPrice.trim().replace(/[$,]/g, "")),
        octoberPrice: parseFloat(req.body.octoberPrice.trim().replace(/[$,]/g, "")),
        novemberPrice: parseFloat(req.body.novemberPrice.trim().replace(/[$,]/g, "")),
        decemberPrice: parseFloat(req.body.decemberPrice.trim().replace(/[$,]/g, "")),
        additionalInformation: req.body.additionalInformation,
        forSalePrice: parseFloat(req.body.forSalePrice.trim().replace(/[$,]/g, "")),
    });

 try {
        await apartment.save();
        
        // update the user's apartments array with the new apartment number. We can do this after saving the apartment to ensure that we only update the user's apartments if the apartment was successfully saved.
        const newlyListedAppartment = { apartmentNumber: apartment.apartmentNumber };
        user.apartments.push(newlyListedAppartment);
        
        // save the user document after updating the apartments array. This will persist the change to the database.
        await user.save();

        req.flash("success", { 
            msg: "Apartment " + apartment.apartmentNumber + " has been listed. Try pulling up this apartment or updating its availability." 
        });
        return res.redirect("/");

    } catch (err: any) {
        if (err.code === 11000 || err.message.includes("11000")) { 
            req.flash("errors", { msg: "The apartment number you entered already exists." });
            return res.redirect("/account/list-apartment");
        }
        return next(err);
    }
}; 
/**
 * GET /login
 * Login page.
 */ /*
export const getCreateApartment = (req: Request, res: Response) => {
    if (req.user) {
        return res.redirect("/");
    }
    res.render("account/login", {
        title: "Login"
    });
};*/

/**
 * POST /login
 * Sign in using email and password.
 */ /*
export const postCreateApartment = async (req: Request, res: Response, next: NextFunction) => {
    await check("email", "Email is not valid").isEmail().run(req);
    await check("password", "Password cannot be blank").isLength({min: 1}).run(req);
    // eslint-disable-next-line @typescript-eslint/camelcase
    await sanitize("email").normalizeEmail({ gmail_remove_dots: false }).run(req);

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
            req.flash("success", { msg: "Success! You are logged in." });
            res.redirect(req.session.returnTo || "/");
        });
    })(req, res, next);
}; */

