import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';

import SiteLayout from '@/components/layout/SiteLayout';
import Home from '@/pages/Home';
import PhilosophyLanding from '@/pages/philosophy/PhilosophyLanding';
import Solid from '@/pages/philosophy/Solid';
import Tdd from '@/pages/philosophy/Tdd';
import CategoryLanding from '@/pages/patterns/CategoryLanding';
import PatternPage from '@/pages/patterns/PatternPage';
import Glossary from '@/pages/Glossary';
import SavedPatterns from '@/pages/SavedPatterns';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/philosophy" element={<PhilosophyLanding />} />
            <Route path="/philosophy/solid" element={<Solid />} />
            <Route path="/philosophy/tdd" element={<Tdd />} />
            <Route path="/patterns/:category" element={<CategoryLanding />} />
            <Route path="/patterns/:category/:slug" element={<PatternPage />} />
            <Route path="/glossary" element={<Glossary />} />
            <Route path="/saved" element={<SavedPatterns />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
        <Toaster />
      </Router>
    </QueryClientProvider>
  )
}

export default App
