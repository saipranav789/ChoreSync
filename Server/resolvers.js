import { GraphQLError } from "graphql";
import validation from "./helpers.js";
import redis from "redis";
import moment from "moment";
import { validate } from "uuid";
import {
  authors as authorCollection,
  books as bookCollection,
} from "./config/mongoCollections.js";

import { v4 as uuid } from "uuid"; //for generating _id's
let client = redis.createClient();
client.connect().then(() => {});

export const resolvers = {
  Query: {
    authors: async () => {
      //search for authors in redis and return

      let cachedAuthors = await client.exists("authors");
      if (cachedAuthors) {
        let authorsInCache = await client.get("authors");
        return JSON.parse(authorsInCache);
      }

      //query from mongo if not in redis
      const authors = await authorCollection();
      const allAuthors = await authors.find({}).toArray();
      if (!allAuthors) {
        //Could not get list
        throw new GraphQLError(`Internal Server Error`, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      // Adding to redis cache with exp time 1 hr
      await client.SETEX("authors", 3600, JSON.stringify(allAuthors));
      return allAuthors;
    },
    books: async () => {
      let cachedBooks = await client.exists("books");
      if (cachedBooks) {
        let booksInCache = await client.get("books");
        return JSON.parse(booksInCache);
      }
      const books = await bookCollection();
      const allBooks = await books.find({}).toArray();
      if (!allBooks) {
        //Could not get list
        throw new GraphQLError(`Internal Server Error`, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      // Adding to redis cache with exp time 1 hr
      await client.SETEX("books", 3600, JSON.stringify(allBooks));
      return allBooks;
    },
    getAuthorById: async (_, args) => {
      //search for author in redis and return
      if (!args._id.trim()) {
        throw new GraphQLError("id cannot be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (!validate(args._id)) {
        throw new GraphQLError("Invalid uuid", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      let cachedAuthor = await client.exists(`author:${args._id}`);
      if (cachedAuthor) {
        let cachedAuthorById = await client.get(`author:${args._id}`);
        return JSON.parse(cachedAuthorById);
      }
      //query in mongo in not avaliable in cache
      const authors = await authorCollection();
      let author = await authors.findOne({ _id: args._id });

      if (!author) {
        throw new GraphQLError("Author Not Found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Adding to redis cache
      await client.set(`author:${args._id}`, JSON.stringify(author));

      return author;
    },
    getBookById: async (_, args) => {
      if (!args._id.trim()) {
        throw new GraphQLError("id cannot be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (!validate(args._id)) {
        throw new GraphQLError("Invalid uuid", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      let cachedBook = await client.exists(`book:${args._id}`);
      if (cachedBook) {
        let bookInCache = await client.get(`book:${args._id}`);
        return JSON.parse(bookInCache);
      }
      const books = await bookCollection();
      let book = await books.findOne({ _id: args._id });
      //console.log(book);
      if (!book) {
        throw new GraphQLError("Book Not Found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      await client.set(`book:${args._id}`, JSON.stringify(book));
      return book;
    },
    booksByGenre: async (_, args) => {
      if (!args.genre || args.genre.trim() === "") {
        throw new GraphQLError("Genre must not be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      //console.log(args.genre);

      const genreKey = args.genre.toLowerCase(); // Convert the genre to lowercase
      const cachedBooksByGenre = await client.exists(genreKey);

      if (cachedBooksByGenre) {
        let cachedBooks = await client.get(genreKey);
        return JSON.parse(cachedBooks);
      }
      //console.log("here");

      const books = await bookCollection();
      const genreRegex = new RegExp(`^${args.genre}$`, "i"); // Create a case-insensitive regular expression

      const booksByGenre = await books.find({ genres: genreRegex }).toArray();
      // console.log(booksByGenre);
      // Cache the result with a one-hour expire time
      if (booksByGenre) {
        await client.SETEX(genreKey, 3600, JSON.stringify(booksByGenre));
      }
      return booksByGenre;
    },
    booksByPriceRange: async (_, args) => {
      if (args.min < 0 || args.max <= args.min) {
        throw new GraphQLError("Invalid price range", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      let exists = await client.exists(`price_${args.min}_${args.max}`);
      if (exists) {
        const cachedBooksByPriceRange = await client.get(
          `price_${args.min}_${args.max}`
        );

        if (cachedBooksByPriceRange) {
          return JSON.parse(cachedBooksByPriceRange);
        }
      }
      const books = await bookCollection();
      const booksByPriceRange = await books
        .find({ price: { $gte: args.min, $lte: args.max } })
        .toArray();

      // Cache the result with a one-hour expire time
      if (booksByPriceRange) {
        await client.setEx(
          `price_${args.min}_${args.max}`,
          3600,
          JSON.stringify(booksByPriceRange)
        );
      }
      return booksByPriceRange;
    },
    searchAuthorsByName: async (_, args) => {
      if (!args.searchTerm || args.searchTerm.trim() === "") {
        throw new GraphQLError("Search term must not be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const searchTerm = args.searchTerm.toLowerCase();
      const cachedAuthorsBySearchTerm = await client.get(searchTerm);

      if (cachedAuthorsBySearchTerm) {
        return JSON.parse(cachedAuthorsBySearchTerm);
      }

      const authors = await authorCollection();
      const searchResult = await authors
        .find({
          $or: [
            { first_name: { $regex: searchTerm, $options: "i" } },
            { last_name: { $regex: searchTerm, $options: "i" } },
          ],
        })
        .toArray();

      // Cache the result with a one-hour expire time
      if (searchResult) {
        await client.SETEX(searchTerm, 3600, JSON.stringify(searchResult));
      }
      return searchResult;
    },
  },
  Book: {
    author: async (parentValue) => {
      //console.log(`parentValue in Employee`, parentValue);
      const authors = await authorCollection();
      const author = await authors.findOne({ _id: parentValue.authorId });
      return author;
    },
  },
  Author: {
    books: async (parent, args) => {
      const books = await bookCollection();
      const authorBooks = await books
        .find({ authorId: parent._id })
        .limit((args.limit > 0 ? args.limit : 0) || 0) // Apply limit if provided
        .toArray();

      return authorBooks;
    },
    numOfBooks: async (parent) => {
      const books = await bookCollection();
      const numOfBooks = await books.count({ authorId: parent._id });

      return numOfBooks;
    },
  },
  Mutation: {
    addAuthor: async (_, args) => {
      // Validate input params
      if (!args.first_name.trim() || !args.last_name.trim()) {
        throw new GraphQLError("First and last name must not be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      // Validate other fields like date_of_birth, hometownCity, and hometownState...
      try {
        validation.checkDateOfBirth(args.date_of_birth);
      } catch (error) {
        throw new GraphQLError("Invalid DOB", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      try {
        validation.checkString(args.hometownCity);
      } catch (error) {
        throw new GraphQLError("Invalid hometownCity", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (
        !validation.isValidState(args.hometownState.toUpperCase()) ||
        args.hometownState.length !== 2
      )
        throw new GraphQLError("Invalid hometownState", {
          extensions: { code: "BAD_USER_INPUT" },
        });

      // Create a new author with a generated _id
      const newAuthor = {
        _id: uuid(),
        first_name: args.first_name,
        last_name: args.last_name,
        date_of_birth: args.date_of_birth,
        hometownCity: args.hometownCity,
        hometownState: args.hometownState.toUpperCase(),
        books: [], // Initialize books as an empty array
      };

      // Add the new author to MongoDB
      const authors = await authorCollection();
      const insertedAuthor = await authors.insertOne(newAuthor);

      //console.log(insertedAuthor);
      if (!insertedAuthor.acknowledged || !insertedAuthor.insertedId) {
        throw new GraphQLError(`Could not Add Author`, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      // Cache the updated authors list without expiration
      const updatedAuthors = await authors.find({}).toArray();
      // updated all authors collection in cache
      await client.set("authors", JSON.stringify(updatedAuthors));
      // added newly inserted author in cache as well.
      await client.set(
        `author:${insertedAuthor.insertedId}`,
        JSON.stringify(newAuthor)
      );

      return newAuthor;
    },
    editAuthor: async (_, args) => {
      const authors = await authorCollection();

      // Check if the author exists
      const existingAuthor = await authors.findOne({ _id: args._id });
      if (!existingAuthor) {
        throw new GraphQLError(`Author with _id ${args._id} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Validate and update the author fields
      if (args.first_name && !args.first_name.trim()) {
        throw new GraphQLError(
          "First name cannot be empty or contain only spaces",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      if (args.last_name && !args.last_name.trim()) {
        throw new GraphQLError(
          "Last name cannot be empty or contain only spaces",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      if (args.hometownCity && !args.hometownCity.trim()) {
        throw new GraphQLError(
          "Hometown city cannot be empty or contain only spaces",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      if (args.hometownState && !validation.isValidState(args.hometownState)) {
        throw new GraphQLError(
          "Hometown state must be a valid two-letter abbreviation (e.g., 'NJ')",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      if (
        args.date_of_birth &&
        !validation.checkDateOfBirth(args.date_of_birth)
      ) {
        throw new GraphQLError(
          "Date of birth must be a valid date in MM/DD/YYYY format",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      // Update the author fields
      const updatedAuthor = {
        ...existingAuthor,
        first_name: args.first_name || existingAuthor.first_name,
        last_name: args.last_name || existingAuthor.last_name,
        date_of_birth: args.date_of_birth || existingAuthor.date_of_birth,
        hometownCity: args.hometownCity || existingAuthor.hometownCity,
        hometownState: args.hometownState || existingAuthor.hometownState,
      };

      // Update the author in MongoDB
      const updatedAuthorResult = await authors.updateOne(
        { _id: args._id },
        { $set: updatedAuthor }
      );

      if (!updatedAuthorResult.acknowledged) {
        throw new GraphQLError("Failed to update author", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      //updating redis cache with edited author.
      const updatedAuthors = await authors.find({}).toArray();
      // updated all authors collection in cache.
      await client.set("authors", JSON.stringify(updatedAuthors));
      // added newly edited author in cache.
      let exists = await client.exists(`author:${updatedAuthor._id}`);
      if (exists) {
        await client.set(
          `author:${updatedAuthor._id}`,
          JSON.stringify(updatedAuthor)
        );
      }

      return updatedAuthor;
    },
    removeAuthor: async (_, args) => {
      const authors = await authorCollection();
      const books = await bookCollection();

      // Check if the author exists
      const existingAuthor = await authors.findOne({ _id: args._id });
      if (!existingAuthor) {
        throw new GraphQLError(`Author with _id ${args._id} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }
      const booksToDel = existingAuthor.books;

      // Delete all books associated with the author
      await books.deleteMany({ authorId: args._id });

      // Delete the author from MongoDB
      const deletedAuthor = await authors.findOneAndDelete({ _id: args._id });

      // Remove author and their books from Redis cache if cached
      const redisKeyAuthor = `author:${args._id}`;

      // Removing books in Redis cache

      booksToDel.map(
        async (element) => await client.del(`book:${element.toString()}`)
      );

      // Remove the author and books from the Redis cache
      await client.del(redisKeyAuthor);

      return deletedAuthor; // Return the deleted author
    },
    addBook: async (_, args) => {
      const books = await bookCollection();
      const authors = await authorCollection();

      // Check if the authorId is a valid authorId and exists in the database
      const author = await authors.findOne({ _id: args.authorId });
      if (!author) {
        throw new GraphQLError(`Author with _id ${args.authorId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Input validation checks
      if (!args.title.trim()) {
        throw new GraphQLError("Title cannot be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (args.genres.length === 0) {
        throw new GraphQLError("Genres cannot be empty arraay", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (args.genres.some((genre) => !genre.trim())) {
        throw new GraphQLError("Genres cannot contain empty values", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const publicationDate = validation.checkDate(args.publicationDate);
      if (!publicationDate) {
        throw new GraphQLError("Invalid publicationDate", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const authorDOB = validation.checkDate(author.date_of_birth);
      if (publicationDate <= authorDOB || !authorDOB) {
        throw new GraphQLError(
          "Publication date must be later than the author's date of birth",
          {
            extensions: { code: "BAD_USER_INPUT" },
          }
        );
      }

      if (args.price <= 0) {
        throw new GraphQLError("Price must be greater than 0", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      //Fixed isbn validation
      if (!validation.isValidISBN(args.isbn)) {
        throw new GraphQLError("Invalid ISBN", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.pageCount <= 0) {
        throw new GraphQLError("PageCount must be greater than 0", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.format.length === 0) {
        throw new GraphQLError("Format cannot be empty arraay", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (args.format.some((element) => !element.trim())) {
        throw new GraphQLError("Format array cannot contain empty values", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const newBook = {
        _id: uuid(),
        title: args.title.trim(),
        genres: args.genres.map((genre) => genre.trim()),
        publicationDate: args.publicationDate,
        publisher: args.publisher.trim(),
        summary: args.summary.trim(),
        isbn: args.isbn,
        language: args.language.trim(),
        pageCount: args.pageCount,
        price: args.price,
        format: args.format.map((format) => format.trim()),
        authorId: args.authorId,
      };

      // Insert the new book into MongoDB
      const insertedBook = await books.insertOne(newBook);

      if (!insertedBook.acknowledged || !insertedBook.insertedId) {
        throw new GraphQLError("Could not add Book", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      // Update the author's books field
      const authorUpdateResult = await authors.updateOne(
        { _id: args.authorId },
        { $addToSet: { books: insertedBook.insertedId } }
      );

      if (!authorUpdateResult.acknowledged) {
        throw new GraphQLError("Failed to update author's books", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      // Add the newly created book to the Redis cache
      const redisKey = `book:${insertedBook.insertedId}`;
      await client.set(redisKey, JSON.stringify(newBook));

      //update author in cache with the added book if it exists
      let authorCacheCheck = await client.exists(`author:${args.authorId}`);
      if (authorCacheCheck) {
        let authorFromDB = await authors.findOne({ _id: args.authorId });
        await client.set(
          `author:${args.authorId}`,
          JSON.stringify(authorFromDB)
        );
      }

      return newBook;
    },
    editBook: async (_, args) => {
      const books = await bookCollection();
      const authors = await authorCollection();

      try {
        let id = validation.checkString(args._id);
      } catch (error) {
        throw new GraphQLError(`Invalid _id ${args.id}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const existingBook = await books.findOne({ _id: args._id });
      if (!existingBook) {
        throw new GraphQLError(`Book with _id ${args._id} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Check if authorId is being updated
      if (args.authorId && args.authorId !== existingBook.authorId) {
        // Check if the new authorId is valid and exists in the database
        const newAuthor = await authors.findOne({ _id: args.authorId });
        if (!newAuthor) {
          throw new GraphQLError(`Author with _id ${args.authorId} not found`, {
            extensions: { code: "NOT_FOUND" },
          });
        }

        // Remove the book ID from the old author's array of book IDs
        const oldAuthor = await authors.findOne({ _id: existingBook.authorId });
        if (oldAuthor) {
          const updatedOldAuthorBooks = oldAuthor.books.filter(
            (bookId) => bookId !== args._id
          );
          await authors.updateOne(
            { _id: existingBook.authorId },
            { $set: { books: updatedOldAuthorBooks } }
          );

          // Push the book ID into the array of books for the new author
          const updatedNewAuthorBooks = [...newAuthor.books, args._id];
          await authors.updateOne(
            { _id: args.authorId },
            { $set: { books: updatedNewAuthorBooks } }
          );
        }
        // Deleting old author in cache
        let exists = await client.exists(`book:${existingBook.authorId}`);
        if (exists) {
          //deleting
          await client.del(`book:${existingBook.authorId}`);
        }
      }

      // Input validation checks

      if (args.title && !args.title.trim()) {
        throw new GraphQLError("Title cannot be empty", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.genres && args.genres.length === 0) {
        throw new GraphQLError("Genres cannot be empty arraay", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.genres && args.genres.some((genre) => !genre.trim())) {
        throw new GraphQLError("Genres cannot contain empty values", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.format && args.format.length === 0) {
        throw new GraphQLError("Format cannot be empty arraay", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (args.format && args.format.some((element) => !element.trim())) {
        throw new GraphQLError("Format array cannot contain empty values", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.publicationDate) {
        const publicationDate = validation.checkDate(args.publicationDate);
        if (!publicationDate) {
          throw new GraphQLError("Invalid publicationDate", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const author = await authors.findOne({
          _id: args.authorId || existingBook.authorId,
        });
        const authorDOB = moment(author.date_of_birth, "MM/DD/YYYY");
        if (!authorDOB) {
          throw new GraphQLError(
            "Invalid author date of birth for this publication date",
            {
              extensions: { code: "BAD_USER_INPUT" },
            }
          );
        }
        // console.log(moment(publicationDate));
        // console.log(authorDOB);
        if (
          // moment(moment(publicationDate)).isSameOrBefore(
          //   author.date_of_birth,
          //   "day"
          // )
          moment(moment(publicationDate)).isSameOrBefore(authorDOB)
        ) {
          throw new GraphQLError(
            "Publication date must be later than the author's date of birth",
            {
              extensions: { code: "BAD_USER_INPUT" },
            }
          );
        }
      }

      if (args.price !== undefined && args.price <= 0) {
        throw new GraphQLError("Price must be greater than 0", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.isbn && !validation.isValidISBN(args.isbn)) {
        throw new GraphQLError("Invalid ISBN format", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      if (args.pageCount !== undefined && args.pageCount <= 0) {
        throw new GraphQLError("PageCount must be greater than 0", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Create an updated book object
      const updatedBook = {
        ...existingBook,
        ...(args.title && { title: args.title.trim() }),
        ...(args.genres && {
          genres: args.genres.map((genre) => genre.trim()),
        }),
        ...(args.publicationDate && { publicationDate: args.publicationDate }),
        ...(args.publisher && { publisher: args.publisher.trim() }),
        ...(args.summary && { summary: args.summary.trim() }),
        ...(args.isbn && { isbn: args.isbn }),
        ...(args.language && { language: args.language.trim() }),
        ...(args.pageCount !== undefined && { pageCount: args.pageCount }),
        ...(args.price !== undefined && { price: args.price }),
        ...(args.format && {
          format: args.format.map((format) => format.trim()),
        }),
        ...(args.authorId && { authorId: args.authorId }),
      };

      // Update the book in MongoDB
      await books.updateOne({ _id: args._id }, { $set: updatedBook });

      // Remove the old book from the Redis cache
      const redisKey = `book:${args._id}`;
      await client.del(redisKey);

      // Setting updated book in Redis cache
      await client.set(redisKey, JSON.stringify(updatedBook));

      return updatedBook;
    },
    removeBook: async (_, args) => {
      const books = await bookCollection();
      const authors = await authorCollection();

      const existingBook = await books.findOne({ _id: args._id });
      if (!existingBook) {
        throw new GraphQLError(`Book with _id ${args._id} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // Remove the book from the Redis cache
      const redisKey = `book:${args._id}`;
      await client.del(redisKey);

      // Remove the book from the author's books array
      const author = await authors.findOne({ _id: existingBook.authorId });
      if (author) {
        const updatedBooks = author.books.filter(
          (bookId) => bookId !== args._id
        );
        await authors.updateOne(
          { _id: existingBook.authorId },
          { $set: { books: updatedBooks } }
        );
      }

      // Delete the book from MongoDB
      const deletedBook = await books.findOneAndDelete({ _id: args._id });

      if (!deletedBook) {
        throw new GraphQLError(`Could not delete book with _id ${args._id}`, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      // Edit author if exists in cache

      let authorCacheCheck = await client.exists(
        `author:${existingBook.authorId}`
      );
      if (authorCacheCheck) {
        let authorFromDB = await authors.findOne({
          _id: existingBook.authorId,
        });
        await client.set(
          `author:${args.authorId}`,
          JSON.stringify(authorFromDB)
        );
      }

      return deletedBook;
    },
  },
};
