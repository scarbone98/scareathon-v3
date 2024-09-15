import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

async function calendarSheet() {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive.file',
            ],
        });

        const doc = new GoogleSpreadsheet('1tDGcPB0QWc7LPe3gONOAcvmdQfNqhRdPQ-8ZdA0WTkM', serviceAccountAuth);

        await doc.loadInfo();

        return doc;
    } catch (e) {
        console.log(e);
        return null;
    }
}

export default calendarSheet;