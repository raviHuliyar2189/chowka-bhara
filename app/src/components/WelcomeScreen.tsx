import { useEffect } from 'react';
import welcomePic from '../assets/Welcome_pic.jpg';
import indiraPic from '../assets/Indira.jpg';

interface Props {
  onDone: () => void;
}

const DISPLAY_MS = 5000;

export default function WelcomeScreen({ onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always Kannada, regardless of the saved language setting — this splash is shown before the
  // language toggle (in the app header, below) is even reachable, so there's no choice to honor
  // yet at this point.
  return (
    <div className="welcome-screen">
      <h1 className="welcome-title">ಚೌಕಾ ಭಾರ</h1>
      <img className="welcome-pic" src={welcomePic} alt="Family get-together" />
      <p className="welcome-message">ನಮ್ಮ ಪ್ರೀತಿಯ ಇಂದಿರತ್ತೆಯ ಸವಿ ನೆನಪಿಗೆ</p>
      <img className="welcome-pic welcome-pic-portrait" src={indiraPic} alt="Indiratte" />
    </div>
  );
}
