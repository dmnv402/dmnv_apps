import React, { useState, useEffect } from 'react';

// Main App Component
export default function App() {
    const [gameState, setGameState] = useState('setup'); // 'setup' or 'game'
    const [bossHp, setBossHp] = useState(1000);
    const [damagePerHit, setDamagePerHit] = useState(50);
    const [currentHp, setCurrentHp] = useState(1000);

    const startGame = (hp, damage) => {
        setBossHp(hp);
        setDamagePerHit(damage);
        setCurrentHp(hp);
        setGameState('game');
    };

    return (
        <>
            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Creepster&display=swap');
                    body {
                        font-family: 'Creepster', cursive;
                        background-color: #111827;
                        color: #fff;
                    }
                    .screen {
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 1rem;
                        overflow: hidden;
                    }
                    .setup-card {
                        width: 100%;
                        max-width: 28rem;
                        background-color: #1f2937;
                        padding: 2rem;
                        border-radius: 0.5rem;
                        border: 4px solid #991b1b;
                        box-shadow: 0 0 30px rgba(179, 0, 0, 0.7);
                    }
                    .title {
                        font-size: 3.75rem;
                        line-height: 1;
                        text-align: center;
                        margin-bottom: 1.5rem;
                        color: #ef4444;
                        text-shadow: 2px 2px 4px #000;
                    }
                    .subtitle {
                        text-align: center;
                        margin-bottom: 2rem;
                        color: #d1d5db;
                    }
                    .form-label {
                        display: block;
                        font-size: 1.125rem;
                        line-height: 1.75rem;
                        margin-bottom: 0.5rem;
                        color: #f87171;
                        text-align: center;
                    }
                    .form-input {
                        width: 80%;
                        display: block;
                        margin-left: auto;
                        margin-right: auto;
                        background-color: #111827;
                        color: #fff;
                        padding: 0.75rem;
                        border-radius: 0.375rem;
                        border: 4px solid;
                        border-image: linear-gradient(to right, #b30000, #ff4d4d) 1;
                        text-align: center;
                    }
                    .form-input:focus {
                        outline: none;
                        box-shadow: 0 0 0 2px #ef4444;
                    }
                    .form-button {
                        width: 100%;
                        background-color: #991b1b;
                        color: #fff;
                        font-weight: 700;
                        padding-top: 0.75rem;
                        padding-bottom: 0.75rem;
                        border-radius: 0.5rem;
                        font-size: 1.25rem;
                        line-height: 1.75rem;
                        transition: all 0.3s;
                        transform-origin: center;
                        box-shadow: 0 0 10px #ff4d4d, 0 0 20px #b30000, 0 0 5px inset #ff4d4d;
                        cursor: pointer;
                        border: none;
                    }
                    .form-button:hover {
                        background-color: #b91c1c;
                        transform: scale(1.05);
                    }
                    .game-container {
                         width: 100%;
                         max-width: 56rem;
                         text-align: center;
                         z-index: 10;
                    }
                    .hp-bar-container {
                        background-color: #1f2937;
                        border: 4px solid #7f1d1d;
                        padding: 1rem;
                        border-radius: 0.75rem;
                        margin-bottom: 2rem;
                        max-width: 32rem;
                        margin-left: auto;
                        margin-right: auto;
                    }
                    .hp-bar-outer {
                        position: relative;
                        width: 100%;
                        background-color: #111827;
                        height: 2.5rem;
                        border-radius: 9999px;
                        overflow: hidden;
                        border: 2px solid #000;
                    }
                    .hp-bar-inner {
                        position: absolute;
                        top: 0;
                        left: 0;
                        height: 100%;
                        background-image: linear-gradient(to right, #ef4444, #991b1b);
                        transition: width 0.5s ease-out;
                    }
                    .hp-bar-text {
                        position: absolute;
                        inset: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.25rem;
                        line-height: 1.75rem;
                        font-weight: 700;
                        color: #fff;
                        letter-spacing: 0.1em;
                        text-shadow: 1px 1px 2px #000;
                    }
                    .prompt-text {
                        font-size: 1.5rem;
                        line-height: 2rem;
                        color: #d1d5db;
                        margin-bottom: 2rem;
                        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    }
                    .balloons-container {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: center;
                        align-items: center;
                        gap: 1rem;
                        max-width: 64rem;
                    }
                    .balloon {
                         position: relative;
                         transition: all 0.5s;
                    }
                    .balloon.popped {
                        opacity: 0;
                        transform: scale(1.5);
                    }
                    .defeated-overlay {
                        position: absolute;
                        inset: 0;
                        background-color: rgba(0,0,0,0.8);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        z-index: 20;
                    }
                    .defeated-text {
                        font-size: 6rem;
                        color: #ef4444;
                        animation: pulse 1.5s infinite;
                    }
                    .play-again-button {
                        margin-top: 2rem;
                        background-color: #374151;
                        color: #fff;
                        font-weight: 700;
                        padding: 0.75rem 1.5rem;
                        border-radius: 0.5rem;
                        font-size: 1.25rem;
                        line-height: 1.75rem;
                        transition: background-color 0.3s;
                        border: none;
                        cursor: pointer;
                    }
                    .play-again-button:hover {
                        background-color: #4b5563;
                    }

                    @keyframes pulse {
                      50% {
                        opacity: .5;
                      }
                    }
                `}
            </style>
            {gameState === 'setup' ?
                <SetupScreen onStart={startGame} /> :
                <GameScreen bossHp={bossHp} currentHp={currentHp} setCurrentHp={setCurrentHp} damagePerHit={damagePerHit} setGameState={setGameState} />
            }
        </>
    );
}

// Setup Screen Component
const SetupScreen = ({ onStart }) => {
    const [hp, setHp] = useState('1000');
    const [damage, setDamage] = useState('50');

    const handleSubmit = (e) => {
        e.preventDefault();
        const hpNum = parseInt(hp, 10);
        const damageNum = parseInt(damage, 10);
        if (!isNaN(hpNum) && !isNaN(damageNum) && hpNum > 0 && damageNum > 0) {
            onStart(hpNum, damageNum);
        } else {
            alert("Please enter valid positive numbers for HP and Damage.");
        }
    };

    return (
        <div className="screen">
            <div className="setup-card">
                <h1 className="title">The Sinister Stage</h1>
                <p className="subtitle">Set the health for the circus monstrosity.</p>
                <form onSubmit={handleSubmit} style={{ spaceY: '1.5rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label htmlFor="boss-hp" className="form-label">Boss Total HP</label>
                        <input
                            id="boss-hp"
                            type="number"
                            value={hp}
                            onChange={(e) => setHp(e.target.value)}
                            className="form-input"
                            placeholder="e.g., 1000"
                        />
                    </div>
                    <div>
                        <label htmlFor="damage" className="form-label">Damage per Hit (Spacebar)</label>
                        <input
                            id="damage"
                            type="number"
                            value={damage}
                            onChange={(e) => setDamage(e.target.value)}
                            className="form-input"
                            placeholder="e.g., 50"
                        />
                    </div>
                    <button type="submit" className="form-button" style={{ marginTop: '1.5rem' }}>
                        Enter the Big Top
                    </button>
                </form>
            </div>
        </div>
    );
};

// Game Screen Component
const GameScreen = ({ bossHp, currentHp, setCurrentHp, damagePerHit, setGameState }) => {
    const [showDefeatedMessage, setShowDefeatedMessage] = useState(false);
    const numBalloons = 20;
    const healthPerBalloon = bossHp / numBalloons;
    const balloonsToPop = Math.floor((bossHp - currentHp) / healthPerBalloon);

    useEffect(() => {
        const handleKeyPress = (e) => {
            if (currentHp <= 0) return;

            if (e.code === 'Space') {
                e.preventDefault();
                setCurrentHp(prevHp => Math.max(0, prevHp - damagePerHit));
            } else if (e.code.startsWith('Numpad')) {
                e.preventDefault();
                const damageAmount = parseInt(e.code.replace('Numpad', ''), 10);
                if (!isNaN(damageAmount)) {
                    setCurrentHp(prevHp => Math.max(0, prevHp - damageAmount));
                }
            } else if (e.code.startsWith('Digit')) {
                e.preventDefault();
                const damageAmount = parseInt(e.code.replace('Digit', ''), 10);
                if (!isNaN(damageAmount)) {
                    setCurrentHp(prevHp => Math.max(0, prevHp - damageAmount));
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [currentHp, damagePerHit, setCurrentHp]);

    useEffect(() => {
        if (currentHp <= 0) {
            setShowDefeatedMessage(true);
        }
    }, [currentHp]);

    const Balloon = ({ isPopped }) => (
        <div className={`balloon ${isPopped ? 'popped' : ''}`}>
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" style={{ width: '5rem', height: '6rem', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
                <path fill="#b30000" d="M85,45 C85,69.85 69.85,90 50,90 C30.15,90 15,69.85 15,45 C15,20.15 30.15,0 50,0 C69.85,0 85,20.15 85,45 Z"/>
                <path fill="#ff4d4d" d="M80,45 C80,67.09 66.57,85 50,85 C33.43,85 20,67.09 20,45 C20,22.91 33.43,5 50,5 C66.57,5 80,22.91 80,45 Z"/>
                <path fill="#660000" d="M50 90 L45 90 L45 100 L55 100 L55 90 Z"/>
                <path fill="#4c0000" d="M47 100 L53 100 L50 120 Z"/>
            </svg>
        </div>
    );
    
    return (
        <div className="screen">
            {showDefeatedMessage && (
                <div className="defeated-overlay">
                    <h2 className="defeated-text">DEFEATED</h2>
                    <p style={{ fontSize: '1.5rem', color: '#fff', marginTop: '1rem' }}>The show is over.</p>
                     <button onClick={() => setGameState('setup')} className="play-again-button">
                        Play Again
                    </button>
                </div>
            )}

            <div className="game-container">
                <h1 className="title" style={{ marginBottom: '1rem' }}>The Jester of Agony</h1>
                <div className="hp-bar-container">
                    <div className="hp-bar-outer">
                        <div className="hp-bar-inner" style={{ width: `${(currentHp / bossHp) * 100}%` }}></div>
                         <span className="hp-bar-text">
                            {Math.max(0, currentHp)} / {bossHp}
                        </span>
                    </div>
                </div>
                 <p className="prompt-text">Press [SPACE] to attack!</p>
            </div>

            <div className="balloons-container">
                {Array.from({ length: numBalloons }).map((_, index) => (
                    <Balloon key={index} isPopped={index < balloonsToPop} />
                ))}
            </div>
        </div>
    );
};

