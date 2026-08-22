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

  return (
    <div className="welcome-screen">
      <h1 className="welcome-title">Chowka Bhara</h1>
      <img className="welcome-pic" src={welcomePic} alt="Family get-together" />
      <p className="welcome-message">In sweet memory of our beloved Indiratte</p>
      <img className="welcome-pic welcome-pic-portrait" src={indiraPic} alt="Indiratte" />
    </div>
  );
}
