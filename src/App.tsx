import { Route, Routes } from 'react-router';
import Cards from './routes/Cards';
import DeckList from './routes/DeckList';
import Import from './routes/Import';
import Study from './routes/Study';
import Dashboard from './routes/Dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DeckList />} />
      <Route path="/import" element={<Import />} />
      <Route path="/cards" element={<Cards />} />
      <Route path="/study/:deckId" element={<Study />} />
      <Route path="/stats" element={<Dashboard />} />
    </Routes>
  );
}
