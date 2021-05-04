import { __awaiter } from "tslib";
const fs = require('fs');
const TOKEN = 'OcIKJRCIxeiHlPQXqJnwauZzOMmdkHuozt5E98YgJhte3PWcSn';
const API_ENDPOINT = 'https://readwise.io/api/v2';
const API_PAGE_SIZE = 1000; // number of results per page, default 100 / max 1000
const BASE_FOLDER_NAME = 'ReadWise';
const HEADERS = {
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${TOKEN}`,
    },
};
const formatDate = (dateStr) => dateStr.split('T')[0];
function checkToken() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = yield fetch(`${API_ENDPOINT}/auth`, HEADERS);
        return results.status === 204; // Returns a 204 response if token is valid
    });
}
// If lastUpdated or bookID aren't provided, fetch everything.
function fetchData(contentType = 'highlights', lastUpdated, bookId) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = `${API_ENDPOINT}/${contentType}?page_size=${API_PAGE_SIZE}`;
        if (lastUpdated)
            url += `&updated__gt=${lastUpdated}`;
        if (bookId)
            url += `&book_id=${bookId}`;
        let data;
        const results = [];
        do {
            console.info(`Fetching ${contentType}`);
            if (lastUpdated)
                console.info(`Checking for new content since ${lastUpdated}`);
            if (bookId)
                console.info(`Checking for all highlights on book ID: ${bookId}`);
            const response = yield fetch(url, HEADERS);
            data = yield response.json();
            // console.log(data);
            if (response.status === 429) { // Error handling for rate limit throttling
                const rateLimitedDelayTime = parseInt(response.headers.get('Retry-After')) * 1000 + 1000;
                console.warn(`API Rate Limited, waiting to retry for ${rateLimitedDelayTime}`);
                yield new Promise((_) => setTimeout(_, rateLimitedDelayTime));
                console.warn('Trying to fetch highlights again...');
                data.next = url;
            }
            else {
                results.push(...data.results);
                if (data.next) {
                    const remainingRecords = data.count - results.length;
                    console.log(`There are ${remainingRecords} more records left, proceeding to next page:` + data.next);
                    url = `${data.next}`;
                }
            }
        } while (data.next);
        console.log(`Processed ${results.length} total ${contentType} results successfully`);
        return results;
    });
}
function fetchUpdatedContent(lastUpdated) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!lastUpdated)
            throw new Error('Date required to fetch updates');
        const updatedHighlights = [];
        const updatedBooks = yield fetchData('books', lastUpdated);
        // Iterate through Newly Updated Books, fetching all of their highlights
        for (let bookId of updatedBooks.map((book) => book.id)) {
            const highlights = yield fetchData('highlights', null, bookId);
            updatedHighlights.push(...highlights);
        }
        return {
            books: updatedBooks,
            highlights: updatedHighlights,
        };
    });
}
function fetchAllHighlightsAndBooks() {
    return __awaiter(this, void 0, void 0, function* () {
        const books = yield fetchData('books');
        const highlights = yield fetchData('highlights');
        return {
            books,
            highlights,
        };
    });
}
function writeLibraryToMarkdown(library) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create parent directories for all categories
        library['categories'].forEach((category) => {
            category = category.charAt(0).toUpperCase() + category.slice(1); // Title Case the directory name
            fs.mkdirSync(`${BASE_FOLDER_NAME}/${category}`, { recursive: true }, (err) => {
                console.error(err);
                throw err;
            });
        });
        for (let bookId in library['books']) {
            const book = library['books'][bookId];
            const { id, title, author, category, num_highlights, updated, cover_image_url, highlights_url, highlights, last_highlight_at, source_url } = book;
            const fileName = `${title.replace(/[<>:"\/\\|?*]+/g, '')}.md`;
            const formattedHighlights = highlights.map((highlight) => formatHighlight(highlight, book)).join('');
            const authors = author.split(/and |,/);
            let authorStr = authors.length > 1
                ? authors
                    .filter((authorName) => authorName.trim() != '')
                    .map((authorName) => `[[${authorName.trim()}]]`)
                    .join(', ')
                : `[[${author}]]`;
            const contents = `%%
ID: ${id}
Updated: ${formatDate(updated)}
%%
![](${cover_image_url.replace('SL200', 'SL500').replace('SY160', 'SY500')})

# About
Title: [[${title}]]
${authors.length > 1 ? 'Authors' : 'Author'}: ${authorStr}
Category: #${category}
Number of Highlights: ==${num_highlights}==
Last Highlighted: *${last_highlight_at ? formatDate(last_highlight_at) : 'Never'}*
Readwise URL: ${highlights_url}${category === 'articles' ? `\nSource URL: ${source_url}\n` : ''}

# Highlights ${formattedHighlights.replace(/---\n$/g, '')}`;
            // fs.writeFile(`${BASE_FOLDER_NAME}/${category.charAt(0).toUpperCase() + category.slice(1)}/${fileName}`, contents, (err) => {
            //   if (err) console.error(err);
            //   else console.log(`${fileName} written successfully`);
            // });
        }
    });
}
function formatHighlight(highlight, book) {
    const { id, text, note, location, highlighted_at, color } = highlight;
    const locationUrl = `https://readwise.io/to_kindle?action=open&asin=${book['asin']}&location=${location}`;
    return `
${text} ${book.category === 'books' ? `([${location}](${locationUrl}))` : ''}${color ? ` %% Color: ${color} %%` : ''} ^${id}${note ? `\n\n**Note: ${note}**` : ``}

---
`;
}
function mergeHighlightsWithBooks(books, highlights) {
    return __awaiter(this, void 0, void 0, function* () {
        const library = {
            categories: new Set(),
            books: {}
        };
        //   for (const bookId of Object.keys(books)) {
        for (const book of books) {
            book['highlights'] = [];
            library['books'][book['id']] = book;
            library['categories'].add(book.category);
        }
        for (const highlight of highlights) {
            library['books'][highlight['book_id']]['highlights'].push(highlight);
        }
        return library;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        let library;
        //   const lastUpdated = store.getItem('lastUpdated');
        const lastUpdated = null;
        if (!lastUpdated) {
            console.info('Previous sync not detected, downloading full library');
            const { highlights, books } = yield fetchAllHighlightsAndBooks();
            library = yield mergeHighlightsWithBooks(books, highlights);
        }
        else {
            console.info(`Checking for new updates since ${lastUpdated}`);
            const { highlights, books } = yield fetchUpdatedContent(lastUpdated);
            library = yield mergeHighlightsWithBooks(books, highlights);
        }
        if (Object.keys(library.books).length > 0) {
            writeLibraryToMarkdown(library);
        }
        else {
            console.info('No new updates found');
        }
        //   store.setItem('lastUpdated', new Date().toISOString());
    });
}
export default main;
// main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZHdpc2VBcGkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWFkd2lzZUFwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXpCLE1BQU0sS0FBSyxHQUFHLG9EQUFvRCxDQUFDO0FBQ25FLE1BQU0sWUFBWSxHQUFHLDRCQUE0QixDQUFDO0FBQ2xELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxDQUFDLHFEQUFxRDtBQUNqRixNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztBQUVwQyxNQUFNLE9BQU8sR0FBRztJQUNkLE9BQU8sRUFBRTtRQUNQLGNBQWMsRUFBRSxrQkFBa0I7UUFDbEMsYUFBYSxFQUFFLFNBQVMsS0FBSyxFQUFFO0tBQ2hDO0NBQ0YsQ0FBQztBQUVGLE1BQU0sVUFBVSxHQUFHLENBQUMsT0FBZSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRTlELFNBQWUsVUFBVTs7UUFDdkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxZQUFZLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUU3RCxPQUFPLE9BQU8sQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsMkNBQTJDO0lBQzVFLENBQUM7Q0FBQTtBQUVELDhEQUE4RDtBQUM5RCxTQUFlLFNBQVMsQ0FBQyxXQUFXLEdBQUcsWUFBWSxFQUFFLFdBQWtCLEVBQUUsTUFBZTs7UUFDdEYsSUFBSSxHQUFHLEdBQUcsR0FBRyxZQUFZLElBQUksV0FBVyxjQUFjLGFBQWEsRUFBRSxDQUFDO1FBQ3RFLElBQUksV0FBVztZQUFFLEdBQUcsSUFBSSxnQkFBZ0IsV0FBVyxFQUFFLENBQUM7UUFDdEQsSUFBSSxNQUFNO1lBQUUsR0FBRyxJQUFJLFlBQVksTUFBTSxFQUFFLENBQUM7UUFFeEMsSUFBSSxJQUFJLENBQUM7UUFFVCxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFFbkIsR0FBRztZQUNELE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLElBQUksV0FBVztnQkFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQy9FLElBQUksTUFBTTtnQkFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBRTlFLE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzQyxJQUFJLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFN0IscUJBQXFCO1lBRXJCLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxHQUFHLEVBQUUsRUFBRSwyQ0FBMkM7Z0JBQ3hFLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztnQkFDekYsT0FBTyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO2dCQUUvRSxNQUFNLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQztnQkFDOUQsT0FBTyxDQUFDLElBQUksQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQzthQUNqQjtpQkFBTTtnQkFDTCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUU5QixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7b0JBQ2IsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7b0JBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxnQkFBZ0IsOENBQThDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNyRyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7aUJBQ3RCO2FBQ0Y7U0FDRixRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFFcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLE9BQU8sQ0FBQyxNQUFNLFVBQVUsV0FBVyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3JGLE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7Q0FBQTtBQU9ELFNBQWUsbUJBQW1CLENBQUMsV0FBaUI7O1FBQ2xELElBQUksQ0FBQyxXQUFXO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBRXBFLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxDQUFDO1FBQzdCLE1BQU0sWUFBWSxHQUFJLE1BQU0sU0FBUyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQVksQ0FBQztRQUV2RSx3RUFBd0U7UUFDeEUsS0FBSyxJQUFJLE1BQU0sSUFBSSxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDNUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxTQUFTLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMvRCxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQztTQUN2QztRQUVELE9BQU87WUFDTCxLQUFLLEVBQUUsWUFBc0I7WUFDN0IsVUFBVSxFQUFFLGlCQUFnQztTQUM3QyxDQUFDO0lBQ0osQ0FBQztDQUFBO0FBRUQsU0FBZSwwQkFBMEI7O1FBQ3ZDLE1BQU0sS0FBSyxHQUFJLE1BQU0sU0FBUyxDQUFDLE9BQU8sQ0FBWSxDQUFDO1FBQ25ELE1BQU0sVUFBVSxHQUFJLE1BQU0sU0FBUyxDQUFDLFlBQVksQ0FBaUIsQ0FBQztRQUVsRSxPQUFPO1lBQ0wsS0FBSztZQUNMLFVBQVU7U0FDWCxDQUFDO0lBQ0osQ0FBQztDQUFBO0FBRUQsU0FBZSxzQkFBc0IsQ0FBQyxPQUFnQjs7UUFDcEQsK0NBQStDO1FBQy9DLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFnQixFQUFFLEVBQUU7WUFDakQsUUFBUSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdDQUFnQztZQUVqRyxFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsZ0JBQWdCLElBQUksUUFBUSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxHQUFXLEVBQUUsRUFBRTtnQkFDbkYsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkIsTUFBTSxHQUFHLENBQUM7WUFDWixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDbkMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXRDLE1BQU0sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUM7WUFDbEosTUFBTSxRQUFRLEdBQUcsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUM7WUFFOUQsTUFBTSxtQkFBbUIsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBb0IsRUFBRSxFQUFFLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVoSCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXZDLElBQUksU0FBUyxHQUNYLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFDaEIsQ0FBQyxDQUFDLE9BQU87cUJBQ0osTUFBTSxDQUFDLENBQUMsVUFBa0IsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztxQkFDdkQsR0FBRyxDQUFDLENBQUMsVUFBa0IsRUFBRSxFQUFFLENBQUMsS0FBSyxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztxQkFDdkQsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDZixDQUFDLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQztZQUV0QixNQUFNLFFBQVEsR0FBRztNQUNmLEVBQUU7V0FDRyxVQUFVLENBQUMsT0FBTyxDQUFDOztNQUV4QixlQUFlLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQzs7O1dBRzlELEtBQUs7RUFDZCxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssU0FBUzthQUM1QyxRQUFROzBCQUNLLGNBQWM7cUJBQ25CLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTztnQkFDaEUsY0FBYyxHQUFHLFFBQVEsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixVQUFVLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRTs7ZUFFaEYsbUJBQW1CLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBRXhELCtIQUErSDtZQUMvSCxpQ0FBaUM7WUFDakMsMERBQTBEO1lBQzFELE1BQU07U0FDUDtJQUNILENBQUM7Q0FBQTtBQXdDRCxTQUFTLGVBQWUsQ0FBQyxTQUFvQixFQUFFLElBQVU7SUFDdkQsTUFBTSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLEdBQUcsU0FBUyxDQUFDO0lBQ3RFLE1BQU0sV0FBVyxHQUFHLGtEQUFrRCxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsUUFBUSxFQUFFLENBQUM7SUFFMUcsT0FBTztFQUNQLElBQUksSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLEtBQUssV0FBVyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLGNBQWMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxlQUFlLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFOzs7Q0FHaEssQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFlLHdCQUF3QixDQUFDLEtBQWEsRUFBRSxVQUF1Qjs7UUFDNUUsTUFBTSxPQUFPLEdBQVk7WUFDdkIsVUFBVSxFQUFFLElBQUksR0FBRyxFQUFFO1lBQ3JCLEtBQUssRUFBRSxFQUFFO1NBQ1YsQ0FBQztRQUVKLCtDQUErQztRQUM3QyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRTtZQUN4QixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDcEMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDMUM7UUFFRCxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRTtZQUNsQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQ3RFO1FBRUQsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztDQUFBO0FBRUQsU0FBZSxJQUFJOztRQUNqQixJQUFJLE9BQU8sQ0FBQztRQUNkLHNEQUFzRDtRQUNwRCxNQUFNLFdBQVcsR0FBUSxJQUFJLENBQUM7UUFFOUIsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixPQUFPLENBQUMsSUFBSSxDQUFDLHNEQUFzRCxDQUFDLENBQUM7WUFDckUsTUFBTSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLDBCQUEwQixFQUFFLENBQUM7WUFDakUsT0FBTyxHQUFHLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1NBQzdEO2FBQU07WUFDTCxPQUFPLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQzlELE1BQU0sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNyRSxPQUFPLEdBQUcsTUFBTSx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7U0FDN0Q7UUFFRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDekMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDakM7YUFBTTtZQUNMLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztTQUN0QztRQUVILDREQUE0RDtJQUM1RCxDQUFDO0NBQUE7QUFFRCxlQUFlLElBQUksQ0FBQztBQUVwQixVQUFVIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5jb25zdCBUT0tFTiA9ICdPY0lLSlJDSXhlaUhsUFFYcUpud2F1WnpPTW1ka0h1b3p0NUU5OFlnSmh0ZTNQV2NTbic7XG5jb25zdCBBUElfRU5EUE9JTlQgPSAnaHR0cHM6Ly9yZWFkd2lzZS5pby9hcGkvdjInO1xuY29uc3QgQVBJX1BBR0VfU0laRSA9IDEwMDA7IC8vIG51bWJlciBvZiByZXN1bHRzIHBlciBwYWdlLCBkZWZhdWx0IDEwMCAvIG1heCAxMDAwXG5jb25zdCBCQVNFX0ZPTERFUl9OQU1FID0gJ1JlYWRXaXNlJztcblxuY29uc3QgSEVBREVSUyA9IHtcbiAgaGVhZGVyczoge1xuICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgQXV0aG9yaXphdGlvbjogYFRva2VuICR7VE9LRU59YCxcbiAgfSxcbn07XG5cbmNvbnN0IGZvcm1hdERhdGUgPSAoZGF0ZVN0cjogc3RyaW5nKSA9PiBkYXRlU3RyLnNwbGl0KCdUJylbMF07XG5cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrVG9rZW4oKSB7XG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBmZXRjaChgJHtBUElfRU5EUE9JTlR9L2F1dGhgLCBIRUFERVJTKTtcblxuICByZXR1cm4gcmVzdWx0cy5zdGF0dXMgPT09IDIwNDsgLy8gUmV0dXJucyBhIDIwNCByZXNwb25zZSBpZiB0b2tlbiBpcyB2YWxpZFxufVxuXG4vLyBJZiBsYXN0VXBkYXRlZCBvciBib29rSUQgYXJlbid0IHByb3ZpZGVkLCBmZXRjaCBldmVyeXRoaW5nLlxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hEYXRhKGNvbnRlbnRUeXBlID0gJ2hpZ2hsaWdodHMnLCBsYXN0VXBkYXRlZD86IERhdGUsIGJvb2tJZD86IE51bWJlcikgOiBQcm9taXNlPEhpZ2hsaWdodFtdIHxCb29rW10+IHtcbiAgbGV0IHVybCA9IGAke0FQSV9FTkRQT0lOVH0vJHtjb250ZW50VHlwZX0/cGFnZV9zaXplPSR7QVBJX1BBR0VfU0laRX1gO1xuICBpZiAobGFzdFVwZGF0ZWQpIHVybCArPSBgJnVwZGF0ZWRfX2d0PSR7bGFzdFVwZGF0ZWR9YDtcbiAgaWYgKGJvb2tJZCkgdXJsICs9IGAmYm9va19pZD0ke2Jvb2tJZH1gO1xuXG4gIGxldCBkYXRhO1xuXG4gIGNvbnN0IHJlc3VsdHMgPSBbXTtcblxuICBkbyB7XG4gICAgY29uc29sZS5pbmZvKGBGZXRjaGluZyAke2NvbnRlbnRUeXBlfWApO1xuICAgIGlmIChsYXN0VXBkYXRlZCkgY29uc29sZS5pbmZvKGBDaGVja2luZyBmb3IgbmV3IGNvbnRlbnQgc2luY2UgJHtsYXN0VXBkYXRlZH1gKTtcbiAgICBpZiAoYm9va0lkKSBjb25zb2xlLmluZm8oYENoZWNraW5nIGZvciBhbGwgaGlnaGxpZ2h0cyBvbiBib29rIElEOiAke2Jvb2tJZH1gKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCBIRUFERVJTKTtcbiAgICBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgLy8gY29uc29sZS5sb2coZGF0YSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MjkpIHsgLy8gRXJyb3IgaGFuZGxpbmcgZm9yIHJhdGUgbGltaXQgdGhyb3R0bGluZ1xuICAgICAgY29uc3QgcmF0ZUxpbWl0ZWREZWxheVRpbWUgPSBwYXJzZUludChyZXNwb25zZS5oZWFkZXJzLmdldCgnUmV0cnktQWZ0ZXInKSkgKiAxMDAwICsgMTAwMDtcbiAgICAgIGNvbnNvbGUud2FybihgQVBJIFJhdGUgTGltaXRlZCwgd2FpdGluZyB0byByZXRyeSBmb3IgJHtyYXRlTGltaXRlZERlbGF5VGltZX1gKTtcblxuICAgICAgYXdhaXQgbmV3IFByb21pc2UoKF8pID0+IHNldFRpbWVvdXQoXywgcmF0ZUxpbWl0ZWREZWxheVRpbWUpKTtcbiAgICAgIGNvbnNvbGUud2FybignVHJ5aW5nIHRvIGZldGNoIGhpZ2hsaWdodHMgYWdhaW4uLi4nKTtcbiAgICAgIGRhdGEubmV4dCA9IHVybDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0cy5wdXNoKC4uLmRhdGEucmVzdWx0cyk7XG5cbiAgICAgIGlmIChkYXRhLm5leHQpIHtcbiAgICAgICAgY29uc3QgcmVtYWluaW5nUmVjb3JkcyA9IGRhdGEuY291bnQgLSByZXN1bHRzLmxlbmd0aDtcbiAgICAgICAgY29uc29sZS5sb2coYFRoZXJlIGFyZSAke3JlbWFpbmluZ1JlY29yZHN9IG1vcmUgcmVjb3JkcyBsZWZ0LCBwcm9jZWVkaW5nIHRvIG5leHQgcGFnZTpgICsgZGF0YS5uZXh0KTtcbiAgICAgICAgdXJsID0gYCR7ZGF0YS5uZXh0fWA7XG4gICAgICB9XG4gICAgfVxuICB9IHdoaWxlIChkYXRhLm5leHQpO1xuXG4gIGNvbnNvbGUubG9nKGBQcm9jZXNzZWQgJHtyZXN1bHRzLmxlbmd0aH0gdG90YWwgJHtjb250ZW50VHlwZX0gcmVzdWx0cyBzdWNjZXNzZnVsbHlgKTtcbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmludGVyZmFjZSBCb29rc0FuZEhpZ2hsaWdodHMge1xuICAgIGJvb2tzOiBCb29rW107XG4gICAgaGlnaGxpZ2h0czogSGlnaGxpZ2h0W107XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoVXBkYXRlZENvbnRlbnQobGFzdFVwZGF0ZWQ6IERhdGUpIDogUHJvbWlzZTxCb29rc0FuZEhpZ2hsaWdodHM+IHtcbiAgaWYgKCFsYXN0VXBkYXRlZCkgdGhyb3cgbmV3IEVycm9yKCdEYXRlIHJlcXVpcmVkIHRvIGZldGNoIHVwZGF0ZXMnKTtcblxuICBjb25zdCB1cGRhdGVkSGlnaGxpZ2h0cyA9IFtdO1xuICBjb25zdCB1cGRhdGVkQm9va3MgPSAoYXdhaXQgZmV0Y2hEYXRhKCdib29rcycsIGxhc3RVcGRhdGVkKSBhcyBCb29rW10pO1xuXG4gIC8vIEl0ZXJhdGUgdGhyb3VnaCBOZXdseSBVcGRhdGVkIEJvb2tzLCBmZXRjaGluZyBhbGwgb2YgdGhlaXIgaGlnaGxpZ2h0c1xuICBmb3IgKGxldCBib29rSWQgb2YgdXBkYXRlZEJvb2tzLm1hcCgoYm9vazogQm9vaykgPT4gYm9vay5pZCkpIHtcbiAgICBjb25zdCBoaWdobGlnaHRzID0gYXdhaXQgZmV0Y2hEYXRhKCdoaWdobGlnaHRzJywgbnVsbCwgYm9va0lkKTtcbiAgICB1cGRhdGVkSGlnaGxpZ2h0cy5wdXNoKC4uLmhpZ2hsaWdodHMpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBib29rczogdXBkYXRlZEJvb2tzIGFzIEJvb2tbXSxcbiAgICBoaWdobGlnaHRzOiB1cGRhdGVkSGlnaGxpZ2h0cyBhcyBIaWdobGlnaHRbXSxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hBbGxIaWdobGlnaHRzQW5kQm9va3MoKSA6IFByb21pc2U8Qm9va3NBbmRIaWdobGlnaHRzPntcbiAgY29uc3QgYm9va3MgPSAoYXdhaXQgZmV0Y2hEYXRhKCdib29rcycpIGFzIEJvb2tbXSk7XG4gIGNvbnN0IGhpZ2hsaWdodHMgPSAoYXdhaXQgZmV0Y2hEYXRhKCdoaWdobGlnaHRzJykgYXMgSGlnaGxpZ2h0W10pO1xuXG4gIHJldHVybiB7XG4gICAgYm9va3MsXG4gICAgaGlnaGxpZ2h0cyxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd3JpdGVMaWJyYXJ5VG9NYXJrZG93bihsaWJyYXJ5OiBMaWJyYXJ5KSB7XG4gIC8vIENyZWF0ZSBwYXJlbnQgZGlyZWN0b3JpZXMgZm9yIGFsbCBjYXRlZ29yaWVzXG4gIGxpYnJhcnlbJ2NhdGVnb3JpZXMnXS5mb3JFYWNoKChjYXRlZ29yeTogc3RyaW5nKSA9PiB7XG4gICAgY2F0ZWdvcnkgPSBjYXRlZ29yeS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGNhdGVnb3J5LnNsaWNlKDEpOyAvLyBUaXRsZSBDYXNlIHRoZSBkaXJlY3RvcnkgbmFtZVxuXG4gICAgZnMubWtkaXJTeW5jKGAke0JBU0VfRk9MREVSX05BTUV9LyR7Y2F0ZWdvcnl9YCwgeyByZWN1cnNpdmU6IHRydWUgfSwgKGVycjogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGZvciAobGV0IGJvb2tJZCBpbiBsaWJyYXJ5Wydib29rcyddKSB7XG4gICAgY29uc3QgYm9vayA9IGxpYnJhcnlbJ2Jvb2tzJ11bYm9va0lkXTtcblxuICAgIGNvbnN0IHsgaWQsIHRpdGxlLCBhdXRob3IsIGNhdGVnb3J5LCBudW1faGlnaGxpZ2h0cywgdXBkYXRlZCwgY292ZXJfaW1hZ2VfdXJsLCBoaWdobGlnaHRzX3VybCwgaGlnaGxpZ2h0cywgbGFzdF9oaWdobGlnaHRfYXQsIHNvdXJjZV91cmwgfSA9IGJvb2s7XG4gICAgY29uc3QgZmlsZU5hbWUgPSBgJHt0aXRsZS5yZXBsYWNlKC9bPD46XCJcXC9cXFxcfD8qXSsvZywgJycpfS5tZGA7XG5cbiAgICBjb25zdCBmb3JtYXR0ZWRIaWdobGlnaHRzID0gaGlnaGxpZ2h0cy5tYXAoKGhpZ2hsaWdodDogSGlnaGxpZ2h0KSA9PiBmb3JtYXRIaWdobGlnaHQoaGlnaGxpZ2h0LCBib29rKSkuam9pbignJyk7XG5cbiAgICBjb25zdCBhdXRob3JzID0gYXV0aG9yLnNwbGl0KC9hbmQgfCwvKTtcblxuICAgIGxldCBhdXRob3JTdHIgPVxuICAgICAgYXV0aG9ycy5sZW5ndGggPiAxXG4gICAgICAgID8gYXV0aG9yc1xuICAgICAgICAgICAgLmZpbHRlcigoYXV0aG9yTmFtZTogc3RyaW5nKSA9PiBhdXRob3JOYW1lLnRyaW0oKSAhPSAnJylcbiAgICAgICAgICAgIC5tYXAoKGF1dGhvck5hbWU6IHN0cmluZykgPT4gYFtbJHthdXRob3JOYW1lLnRyaW0oKX1dXWApXG4gICAgICAgICAgICAuam9pbignLCAnKVxuICAgICAgICA6IGBbWyR7YXV0aG9yfV1dYDtcblxuICAgIGNvbnN0IGNvbnRlbnRzID0gYCUlXG5JRDogJHtpZH1cblVwZGF0ZWQ6ICR7Zm9ybWF0RGF0ZSh1cGRhdGVkKX1cbiUlXG4hW10oJHtjb3Zlcl9pbWFnZV91cmwucmVwbGFjZSgnU0wyMDAnLCAnU0w1MDAnKS5yZXBsYWNlKCdTWTE2MCcsICdTWTUwMCcpfSlcblxuIyBBYm91dFxuVGl0bGU6IFtbJHt0aXRsZX1dXVxuJHthdXRob3JzLmxlbmd0aCA+IDEgPyAnQXV0aG9ycycgOiAnQXV0aG9yJ306ICR7YXV0aG9yU3RyfVxuQ2F0ZWdvcnk6ICMke2NhdGVnb3J5fVxuTnVtYmVyIG9mIEhpZ2hsaWdodHM6ID09JHtudW1faGlnaGxpZ2h0c309PVxuTGFzdCBIaWdobGlnaHRlZDogKiR7bGFzdF9oaWdobGlnaHRfYXQgPyBmb3JtYXREYXRlKGxhc3RfaGlnaGxpZ2h0X2F0KSA6ICdOZXZlcid9KlxuUmVhZHdpc2UgVVJMOiAke2hpZ2hsaWdodHNfdXJsfSR7Y2F0ZWdvcnkgPT09ICdhcnRpY2xlcycgPyBgXFxuU291cmNlIFVSTDogJHtzb3VyY2VfdXJsfVxcbmAgOiAnJ31cblxuIyBIaWdobGlnaHRzICR7Zm9ybWF0dGVkSGlnaGxpZ2h0cy5yZXBsYWNlKC8tLS1cXG4kL2csICcnKX1gO1xuXG4gICAgLy8gZnMud3JpdGVGaWxlKGAke0JBU0VfRk9MREVSX05BTUV9LyR7Y2F0ZWdvcnkuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBjYXRlZ29yeS5zbGljZSgxKX0vJHtmaWxlTmFtZX1gLCBjb250ZW50cywgKGVycikgPT4ge1xuICAgIC8vICAgaWYgKGVycikgY29uc29sZS5lcnJvcihlcnIpO1xuICAgIC8vICAgZWxzZSBjb25zb2xlLmxvZyhgJHtmaWxlTmFtZX0gd3JpdHRlbiBzdWNjZXNzZnVsbHlgKTtcbiAgICAvLyB9KTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgSGlnaGxpZ2h0IHtcbiAgICBpZDogbnVtYmVyO1xuICAgIHRleHQ6IHN0cmluZztcbiAgICBub3RlOiBzdHJpbmc7XG4gICAgbG9jYXRpb246IG51bWJlcjtcbiAgICBsb2NhdGlvbl90eXBlOiBzdHJpbmc7XG4gICAgaGlnaGxpZ2h0ZWRfYXQ6IHN0cmluZztcbiAgICB1cmw6IHN0cmluZyB8IG51bGw7XG4gICAgY29sb3I6IHN0cmluZztcbiAgICB1cGRhdGVkOiBzdHJpbmc7XG4gICAgYm9va19pZDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQm9vayB7XG4gICAgaWQ6IG51bWJlcjtcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIGF1dGhvcjogc3RyaW5nO1xuICAgIGNhdGVnb3J5OiBzdHJpbmc7XG4gICAgbnVtX2hpZ2hsaWdodHM6IG51bWJlcjtcbiAgICBsYXN0X2hpZ2hsaWdodF9hdDogc3RyaW5nO1xuICAgIHVwZGF0ZWQ6IHN0cmluZztcbiAgICBjb3Zlcl9pbWFnZV91cmw6IHN0cmluZ1xuICAgIGhpZ2hsaWdodHNfdXJsOiBzdHJpbmdcbiAgICBzb3VyY2VfdXJsOiBzdHJpbmcgfCBudWxsXG4gICAgYXNpbjogc3RyaW5nXG4gICAgLy8gaGlnaGxpZ2h0czogSGlnaGxpZ2h0W11cbiAgICBoaWdobGlnaHRzOiBhbnlbXVxufVxuXG5pbnRlcmZhY2UgQm9va3Mge1xuICAgIFtrZXk6IHN0cmluZ106IEJvb2tcbn1cblxuaW50ZXJmYWNlIExpYnJhcnkge1xuICAgIGNhdGVnb3JpZXM6IFNldDxTdHJpbmc+O1xuICAgIGJvb2tzOiBCb29rcztcbn1cblxuZnVuY3Rpb24gZm9ybWF0SGlnaGxpZ2h0KGhpZ2hsaWdodDogSGlnaGxpZ2h0LCBib29rOiBCb29rKSB7XG4gIGNvbnN0IHsgaWQsIHRleHQsIG5vdGUsIGxvY2F0aW9uLCBoaWdobGlnaHRlZF9hdCwgY29sb3IgfSA9IGhpZ2hsaWdodDtcbiAgY29uc3QgbG9jYXRpb25VcmwgPSBgaHR0cHM6Ly9yZWFkd2lzZS5pby90b19raW5kbGU/YWN0aW9uPW9wZW4mYXNpbj0ke2Jvb2tbJ2FzaW4nXX0mbG9jYXRpb249JHtsb2NhdGlvbn1gO1xuXG4gIHJldHVybiBgXG4ke3RleHR9ICR7Ym9vay5jYXRlZ29yeSA9PT0gJ2Jvb2tzJyA/IGAoWyR7bG9jYXRpb259XSgke2xvY2F0aW9uVXJsfSkpYCA6ICcnfSR7Y29sb3IgPyBgICUlIENvbG9yOiAke2NvbG9yfSAlJWAgOiAnJ30gXiR7aWR9JHtub3RlID8gYFxcblxcbioqTm90ZTogJHtub3RlfSoqYCA6IGBgfVxuXG4tLS1cbmA7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG1lcmdlSGlnaGxpZ2h0c1dpdGhCb29rcyhib29rczogQm9va1tdLCBoaWdobGlnaHRzOiBIaWdobGlnaHRbXSkge1xuICBjb25zdCBsaWJyYXJ5OiBMaWJyYXJ5ID0ge1xuICAgIGNhdGVnb3JpZXM6IG5ldyBTZXQoKSxcbiAgICBib29rczoge31cbiAgfTtcblxuLy8gICBmb3IgKGNvbnN0IGJvb2tJZCBvZiBPYmplY3Qua2V5cyhib29rcykpIHtcbiAgZm9yIChjb25zdCBib29rIG9mIGJvb2tzKSB7XG4gICAgYm9va1snaGlnaGxpZ2h0cyddID0gW107XG4gICAgbGlicmFyeVsnYm9va3MnXVtib29rWydpZCddXSA9IGJvb2s7XG4gICAgbGlicmFyeVsnY2F0ZWdvcmllcyddLmFkZChib29rLmNhdGVnb3J5KTtcbiAgfVxuXG4gIGZvciAoY29uc3QgaGlnaGxpZ2h0IG9mIGhpZ2hsaWdodHMpIHtcbiAgICBsaWJyYXJ5Wydib29rcyddW2hpZ2hsaWdodFsnYm9va19pZCddXVsnaGlnaGxpZ2h0cyddLnB1c2goaGlnaGxpZ2h0KTtcbiAgfVxuXG4gIHJldHVybiBsaWJyYXJ5O1xufVxuXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xuICBsZXQgbGlicmFyeTtcbi8vICAgY29uc3QgbGFzdFVwZGF0ZWQgPSBzdG9yZS5nZXRJdGVtKCdsYXN0VXBkYXRlZCcpO1xuICBjb25zdCBsYXN0VXBkYXRlZDogYW55ID0gbnVsbDtcblxuICBpZiAoIWxhc3RVcGRhdGVkKSB7XG4gICAgY29uc29sZS5pbmZvKCdQcmV2aW91cyBzeW5jIG5vdCBkZXRlY3RlZCwgZG93bmxvYWRpbmcgZnVsbCBsaWJyYXJ5Jyk7XG4gICAgY29uc3QgeyBoaWdobGlnaHRzLCBib29rcyB9ID0gYXdhaXQgZmV0Y2hBbGxIaWdobGlnaHRzQW5kQm9va3MoKTtcbiAgICBsaWJyYXJ5ID0gYXdhaXQgbWVyZ2VIaWdobGlnaHRzV2l0aEJvb2tzKGJvb2tzLCBoaWdobGlnaHRzKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmluZm8oYENoZWNraW5nIGZvciBuZXcgdXBkYXRlcyBzaW5jZSAke2xhc3RVcGRhdGVkfWApO1xuICAgIGNvbnN0IHsgaGlnaGxpZ2h0cywgYm9va3MgfSA9IGF3YWl0IGZldGNoVXBkYXRlZENvbnRlbnQobGFzdFVwZGF0ZWQpO1xuICAgIGxpYnJhcnkgPSBhd2FpdCBtZXJnZUhpZ2hsaWdodHNXaXRoQm9va3MoYm9va3MsIGhpZ2hsaWdodHMpO1xuICB9XG5cbiAgaWYgKE9iamVjdC5rZXlzKGxpYnJhcnkuYm9va3MpLmxlbmd0aCA+IDApIHtcbiAgICB3cml0ZUxpYnJhcnlUb01hcmtkb3duKGxpYnJhcnkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuaW5mbygnTm8gbmV3IHVwZGF0ZXMgZm91bmQnKTtcbiAgfVxuXG4vLyAgIHN0b3JlLnNldEl0ZW0oJ2xhc3RVcGRhdGVkJywgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgbWFpbjtcblxuLy8gbWFpbigpO1xuIl19