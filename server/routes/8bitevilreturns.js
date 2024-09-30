import { db } from '../firebase.js';
import { collection, doc, getDoc, setDoc, runTransaction, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';

export default async function (fastify, options) {
    fastify.get('/getUserData', async (request, reply) => {
        try {
            const { userId } = request.query;
            const userDoc = await getDoc(doc(db, 'games', '8bitevilreturns', 'users', userId));

            return userDoc.data();
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.post('/setUserData', async (request, reply) => {
        try {
            const data = request.body;
            const keys = ['silverAmount', 'userName', 'unlockedCharacters', 'userId'];
            const filteredData = Object.fromEntries(
                Object.entries(data).filter(([key]) => keys.includes(key))
            );

            if (filteredData.silverAmount) {
                filteredData.silverAmount = parseInt(filteredData.silverAmount);
            }

            await setDoc(doc(db, 'games', '8bitevilreturns', 'users', filteredData.userId), filteredData, { merge: true });

            return { data: 'success' };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.post('/unlockCharacter', async (request, reply) => {
        try {
            const { userId } = request.query;
            const { characterName, cost } = request.body;

            const userDocRef = doc(db, 'games', '8bitevilreturns', 'users', userId);

            await runTransaction(db, async (transaction) => {
                const userDataSnapshot = await transaction.get(userDocRef);

                if (!userDataSnapshot.exists()) {
                    throw new Error("Document does not exist!");
                }

                let { unlockedCharacters = [], silverAmount } = userDataSnapshot.data();

                if (!unlockedCharacters.includes(characterName)) {
                    unlockedCharacters = [...unlockedCharacters, characterName];
                    transaction.set(userDocRef, { unlockedCharacters, silverAmount: silverAmount - cost }, { merge: true });
                }
            });

            return { data: 'success' };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.post('/runs', async (request, reply) => {
        try {
            const { v = '' } = request.query;
            const data = request.body;
            const keys = ['runTimeSeconds', 'kills', 'candyCollected', 'userName', 'userId', 'itemsUsed', 'selectedCharacter'];
            const filteredData = Object.fromEntries(
                Object.entries(data).filter(([key]) => keys.includes(key))
            );

            ['runTimeSeconds', 'kills', 'candyCollected'].forEach(key => {
                if (filteredData[key]) {
                    filteredData[key] = parseInt(filteredData[key]);
                }
            });

            await addDoc(collection(db, 'games', '8bitevilreturns', `runs-${v}`), filteredData);

            return { data: 'success' };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.get('/getLeaderBoard', async (request, reply) => {
        const { field = 'runTimeSeconds', v = '' } = request.query;
        fastify.log.info(`Leaderboard request - field: ${field}, v: ${v}`);

        try {
            // Validate the field parameter
            const validFields = ['runTimeSeconds', 'kills', 'candyCollected'];
            if (!validFields.includes(field)) {
                fastify.log.warn(`Invalid field parameter: ${field}`);
                return reply.code(400).send({ error: 'Invalid field parameter' });
            }

            const collectionPath = `games/8bitevilreturns/runs-${v}`;
            fastify.log.info(`Querying collection: ${collectionPath}`);

            const collectionRef = collection(db, collectionPath);

            // Check if the collection exists
            const collectionSnapshot = await getDocs(collectionRef);
            if (collectionSnapshot.empty) {
                fastify.log.warn(`Collection ${collectionPath} is empty or does not exist`);
                return reply.code(200).send({ data: [] }); // Return an empty array instead of an error
            }

            const q = query(
                collectionRef,
                orderBy(field, 'desc'),
                limit(15)
            );

            const leaderBoardSnapshot = await getDocs(q);
            const leaderBoardData = leaderBoardSnapshot.docs.map(doc => doc.data());

            fastify.log.info(`Leaderboard data retrieved successfully. Items: ${leaderBoardData.length}`);
            return { data: leaderBoardData };
        } catch (err) {
            fastify.log.error(`Error in getLeaderBoard: ${err.message}`);
            fastify.log.error(err.stack);
            return reply.code(500).send({ error: 'An error occurred with our database' });
        }
    });
}
