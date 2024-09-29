import { useEffect, useState } from 'react';
// import Playing from '../../../assets/images/playing.png';
// import Muted from '../../../assets/images/muted.png';
import { fetchWithAuth } from '../../../../fetchWithAuth';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { supabase } from '../../../../supabaseClient';

export default function LeaderBoardModal({ playAgainCallback, score }) {
    const [leaderBoard, setLeaderBoard] = useState({ loading: true, data: [] });
    const [songMuted, setSongMuted] = useState(false);

    useEffect(() => {
        async function submitData() {

            // CHECK IF USER MUTED THE SONG
            const songState = localStorage.getItem('8BitEvilSongState');
            if (songState) {
                setSongMuted(songState === 'muted');
            }

            let scores = [];
            try {
                scores = await fetchWithAuth(`/games/getLeaderboard?game=8%20Bit%20Evil&metric=score`).then(res => res.json());
            } catch (err) {
                console.log(err);
            }

            let scoresWithCurrent = [...scores.data];

            const {data} = await supabase.auth.getUser();

            if (score > 0 || scores.data.length < 10) {
                scoresWithCurrent = [{ score, userId: data.user?.email }, ...scoresWithCurrent];
            }

            scoresWithCurrent.sort((a, b) => b.score - a.score);

            setLeaderBoard({ loading: false, data: scoresWithCurrent.slice(0, 10) });
            if (score > 0) {
                try {
                    await fetchWithAuth('/games/submitScore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ game: '8 Bit Evil', metricName: 'score', metricValue: score })
                    });
                } catch (err) {
                    console.log(err);
                }
            }
        }
        submitData();
    }, []);

    return (
        <div className="fixed inset-0 flex items-center justify-center text-white font-maneater tracking-wider text-2xl z-10">
            <div className={`relative p-6 pt-3 pb-3 rounded-lg w-full max-w-[95vw] max-h-[90vh] overflow-auto ${leaderBoard.loading ? 'bg-transparent' : 'bg-[rgb(177,10,10)]'}`}>
                {
                    !leaderBoard.loading &&
                    <div
                        className="absolute top-4 right-4 cursor-pointer"
                        onClick={
                            () => {
                                if (window.customFunctions?.musicObject) {
                                    if (window.customFunctions.musicObject.isPlaying) {
                                        window.customFunctions.musicObject.pause();
                                        setSongMuted(true);
                                        localStorage.setItem('8BitEvilSongState', 'muted');
                                    } else {
                                        window.customFunctions.musicObject.play();
                                        setSongMuted(false);
                                        localStorage.setItem('8BitEvilSongState', 'playing');
                                    }
                                }
                            }
                        }
                    >
                        {songMuted ? <img src={""} alt="Muted" /> : <img src={""} alt="Playing" />}
                    </div>
                }
                {
                    leaderBoard.loading ?
                        <LoadingSpinner /> :
                        (
                            <div>
                                <h2 className="text-center mt-0 text-3xl mb-4">LEADERBOARD</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full mb-4">
                                        <thead>
                                            <tr className="text-black">
                                                <th className="text-left w-1/6">RANK</th>
                                                <th className="text-center w-3/6">USER</th>
                                                <th className="text-right w-2/6">SCORE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leaderBoard.data.map(({ score, userId }, index) => (
                                                <tr key={index}>
                                                    <td className="text-left text-2xl">{index + 1}</td>
                                                    <td className="text-center text-2xl overflow-hidden overflow-ellipsis whitespace-nowrap max-w-0">{userId}</td>
                                                    <td className="text-right text-2xl">{(score || 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <h2 className="text-3xl">Your score: {(score || 0).toLocaleString()}</h2>
                                <div className="flex justify-between mt-4">
                                    <div onClick={() => playAgainCallback()} className="cursor-pointer border border-black p-2 rounded-lg hover:text-black hover:bg-white">PLAY AGAIN</div>
                                </div>
                            </div>
                        )
                }
            </div>
        </div>
    )
}