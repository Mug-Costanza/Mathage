import { useState, useEffect, useRef } from "react";
import Cookies from 'js-cookie';
import DotBackground from "./DotBackground";
import DrawInput from "./DrawInput";
import { loadMNISTModel, predictDigitsFromDataURL } from "./ml/mnist";
import Calendar from "./Calendar";
import GraphView from "./GraphView";
import "./App.css";

// Function to generate a seeded random number
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Function to get the seed for the day
function getDailySeed() {
  const now = new Date();
  // Using YYYYMMDD as the seed
  const dateStr = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return dateStr;
}

function ProblemScroller({ problems, currentIndex, parsedAnswer, problemResults }) {
  return (
    <>
      <div className="problem-scroller-container">
        <div
          className="problem-scroller"
          style={{ transform: `translateY(-${currentIndex * 100}%)` }}
        >
          {problems.map((problem, index) => (
            <div key={index} className="problem-slide">
              <div className="problem-display">
                {problem.a} {problem.operator} {problem.b} =
                {
                  problemResults[index] ? (
                    problemResults[index] === "correct" ? "✔" : "✖"
                  ) : (
                    index === currentIndex ? (parsedAnswer || "?") : "?"
                  )
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function App() {
  const totalProblems = 20;
  const [isGameActive, setIsGameActive] = useState(false);
  const [practiceCompleted, setPracticeCompleted] = useState(false);
  const [problems, setProblems] = useState([]);
  const [parsedAnswer, setParsedAnswer] = useState("");
  const [problemResults, setProblemResults] = useState(Array(totalProblems).fill(null));
  const [score, setScore] = useState(0);
  const [problemIndex, setProblemIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [model, setModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [dailyGameState, setDailyGameState] = useState({});
  const [dailyScores, setDailyScores] = useState({});
  const [gameMode, setGameMode] = useState(null);
  const [view, setView] = useState('calendar');
  const [feedback, setFeedback] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const autoSubmitTimeoutId = useRef(null);
  const lastPredictedAnswer = useRef("");
  const clearCanvasRef = useRef(null);
    
    const [isMuted, setIsMuted] = useState(() => {
        const muted = Cookies.get('isMuted');
        return muted === 'true';
    });

  useEffect(() => {
    async function loadModel() {
      const loadedModel = await loadMNISTModel();
      setModel(loadedModel);
      setModelLoading(false);
    }
    loadModel();
  }, []);

  useEffect(() => {
    const dailyData = localStorage.getItem('mathageDaily');
    const scoresData = localStorage.getItem('mathageScores');
    const today = getDailySeed();
    
    let loadedState = dailyData ? JSON.parse(dailyData) : {};
    let loadedScores = scoresData ? JSON.parse(scoresData) : {};

    if (loadedState.date !== today) {
      loadedState = {
        date: today,
        completed: false,
        score: null,
        time: null,
      };
      localStorage.setItem('mathageDaily', JSON.stringify(loadedState));
    }
    setDailyGameState(loadedState);
    setDailyScores(loadedScores);
  }, []);

  useEffect(() => {
    let interval;
    if (isGameActive && !isDrawing) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isGameActive, isDrawing]);

  useEffect(() => {
    if (parsedAnswer && parsedAnswer !== lastPredictedAnswer.current && !isDrawing) {
      lastPredictedAnswer.current = parsedAnswer;
      const currentProblem = problems[problemIndex];
      const isCorrect = parseInt(parsedAnswer) === currentProblem?.answer;
        
      if (autoSubmitTimeoutId.current) {
          clearTimeout(autoSubmitTimeoutId.current);
      }
      autoSubmitTimeoutId.current = setTimeout(() => {
          checkAndAdvance(isCorrect);
      }, isCorrect ? 0 : 1000);
    } else if (parsedAnswer === "") {
        if (autoSubmitTimeoutId.current) {
            clearTimeout(autoSubmitTimeoutId.current);
        }
    }
    return () => {
        if (autoSubmitTimeoutId.current) {
            clearTimeout(autoSubmitTimeoutId.current);
        }
    };
  }, [parsedAnswer, problemIndex, problems, isDrawing]);
    
    function toggleMute() {
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        Cookies.set('isMuted', newMutedState, { expires: 365 }); // Save preference for a year
    }

    function playSound(file) {
        if (isMuted) return;
        const audio = new Audio(process.env.PUBLIC_URL + `/${file}`);
        audio.volume = 0.25;
        audio.play();
    }

  function generateProblem(randomFn) {
    const a = Math.floor(randomFn() * 20) + 1;
    const b = Math.floor(randomFn() * 20) + 1;
    let operator = randomFn() < 0.5 ? "+" : "-";
    let answer;
    
    if (operator === "-") {
      if (a >= b) {
        answer = a - b;
      } else {
        operator = "+";
        answer = a + b;
      }
    } else {
      answer = a + b;
    }
    
    return { a, b, operator, answer };
  }

  function startGame(mode) {
    setGameMode(mode);
    setScore(0);
    setProblemIndex(0);
    setTimer(0);
    setPracticeCompleted(false);

    let generatedProblems;
    if (mode === 'daily') {
        const seed = getDailySeed();
        let currentSeed = seed;
        const seededRandomFn = () => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        };
        generatedProblems = Array.from({ length: totalProblems }, () => generateProblem(seededRandomFn));
    } else {
        generatedProblems = Array.from({ length: totalProblems }, () => generateProblem(Math.random));
    }

    setProblems(generatedProblems);
    setProblemResults(Array(totalProblems).fill(null));
    setIsGameActive(true);
    setParsedAnswer("");
  }

  async function handleCanvasSubmit(imageData) {
    if (!model) {
      console.error("Model not loaded yet.");
      return;
    }
    
    if (autoSubmitTimeoutId.current) {
        clearTimeout(autoSubmitTimeoutId.current);
    }
    
    const predicted = await predictDigitsFromDataURL(imageData, model);
    setParsedAnswer(predicted);
  }

  function checkAndAdvance(isCorrect) {
    if (autoSubmitTimeoutId.current) {
        clearTimeout(autoSubmitTimeoutId.current);
    }
    
    setProblemResults(prevResults => {
      const newResults = [...prevResults];
      newResults[problemIndex] = isCorrect ? "correct" : "incorrect";
      return newResults;
    });

    if (isCorrect) {
      setScore((s) => s + 1);
      setFeedback({ text: "✓", type: "correct" });
      setTimeout(() => setFeedback(null), 1000);
      playSound("correct.mp3");
    } else {
      setTimer((t) => t + 5);
      setFeedback({ text: "+5s", type: "incorrect" });
      setTimeout(() => setFeedback(null), 2000);
      playSound("incorrect.mp3");
    }

    if (problemIndex + 1 >= totalProblems) {
      setTimeout(() => {
        setIsGameActive(false);
        if (gameMode === 'daily') {
          const today = getDailySeed();
          const finalScore = isCorrect ? score + 1 : score;
          const dailyData = {
            date: today,
            completed: true,
            score: finalScore,
            time: timer,
          };
          localStorage.setItem('mathageDaily', JSON.stringify(dailyData));
          setDailyGameState(dailyData);
          
          const newDailyScores = { ...dailyScores, [today]: { score: finalScore, time: timer } };
          localStorage.setItem('mathageScores', JSON.stringify(newDailyScores));
          setDailyScores(newDailyScores);
        } else if (gameMode === 'practice') {
          const finalScore = isCorrect ? score + 1 : score;
          setScore(finalScore);
          setPracticeCompleted(true);
        }
      }, 0);
    } else {
      setTimeout(() => {
        setProblemIndex((i) => i + 1);
      }, 0);
    }
      
    if (clearCanvasRef.current) {
        clearCanvasRef.current();
    }
      
    setParsedAnswer("");
    lastPredictedAnswer.current = "";
  }

  function handleClearParsed() {
    if (autoSubmitTimeoutId.current) {
      clearTimeout(autoSubmitTimeoutId.current);
    }
    setParsedAnswer("");
    lastPredictedAnswer.current = "";
    if (clearCanvasRef.current) {
      clearCanvasRef.current();
    }
  }

  function calculateBrainAge() {
    return 20;
  }

  const isDailyCompleted = dailyGameState.completed;

  return (
    <>
      <DotBackground numDots={120} />
      <div className="App">
        <h1 className="title">Mathage</h1>
        
          {!isGameActive && practiceCompleted ? (
            <div className="game-over-container">
              <h2>Game Over!</h2>
              <p>Your score: {score} / {totalProblems}</p>
              <p>Time: {timer} seconds</p>
              <button onClick={() => startGame('practice')} className="main-button">
                Play Again
              </button>
              <button onClick={() => setPracticeCompleted(false)} className="toggle-view-button" style={{marginTop: '1rem'}}>
                Back to Menu
              </button>
            </div>
          ) : !isGameActive && isDailyCompleted ? (
            <div className="game-over-container">
              <h2>Daily Challenge Complete!</h2>
              <p>Your score: {dailyGameState.score} / {totalProblems}</p>
              <p>Time: {dailyGameState.time} seconds</p>
              <p>Come back tomorrow for a new challenge!</p>
              <button onClick={() => startGame('practice')} className="main-button">
                Start Practice Mode
              </button>
                                                   <button className="toggle-view-button" onClick={() => setView(view === 'calendar' ? 'graph' : 'calendar')}>
                                                     {view === 'calendar' ? 'Show Graph View' : 'Show Calendar View'}
                                                   </button>
              {view === 'calendar' ? <Calendar dailyScores={dailyScores} /> : <GraphView dailyScores={dailyScores} />}
            </div>
          ) : (
            <>
              {isGameActive ? (
                <>
                  <ProblemScroller
                    problems={problems}
                    currentIndex={problemIndex}
                    parsedAnswer={parsedAnswer}
                    problemResults={problemResults}
                  />
                  <DrawInput
                    onSubmit={handleCanvasSubmit}
                    onClear={handleClearParsed}
                    clearCanvasRef={clearCanvasRef}
                    onDrawingChange={setIsDrawing}
                  />
                  <div className="button-group">
                    <button onClick={handleClearParsed} className="main-button">Clear</button>
                               </div>
                               <div>
                               <button onClick={toggleMute} className="main-button">
                                   {isMuted ? 'Unmute' : 'Mute'}
                               </button>
                               </div>
                  <div className="game-info">
                    <span>Score:</span> {score} | <span>Problem:</span> {problemIndex + 1}/{totalProblems} | <span>Timer:</span> {timer}s
                    <span className="feedback-container">
                        <span className={`feedback-inline incorrect ${feedback?.text === '+5s' ? 'show' : ''}`}>
                            +5s
                        </span>
                        <span className={`feedback-inline correct ${feedback?.text === '✓' ? 'show' : ''}`}>
                            ✓
                        </span>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="start-menu-container">
                    <button onClick={() => startGame('daily')} className="main-button" disabled={modelLoading}>
                      {modelLoading ? "Loading..." : "Start Daily Challenge"}
                    </button>
                    <button onClick={() => startGame('practice')} className="main-button" disabled={modelLoading}>
                      {modelLoading ? "Loading..." : "Start Practice Mode"}
                    </button>
                   </div>
                   <div>
                   <button onClick={toggleMute} className="main-button">
                       {isMuted ? 'Unmute' : 'Mute'}
                   </button>
                  </div>
                </>
              )}
            </>
          )
        }
          <div className="app-footer">
                 <a href="/privacy-policy.html" className="privacy-policy-link">Privacy Policy</a>
             </div>
      </div>
    </>
  );
}

export default App;
