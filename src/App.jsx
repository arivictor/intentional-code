import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import SiteLayout from '@/components/layout/SiteLayout';
import Home from '@/pages/Home';
import PhilosophyLanding from '@/pages/philosophy/PhilosophyLanding';
import Solid from '@/pages/philosophy/Solid';
import Tdd from '@/pages/philosophy/Tdd';
import PatternCatalog from '@/pages/patterns/PatternCatalog';
import CategoryLanding from '@/pages/patterns/CategoryLanding';
import PatternPage from '@/pages/patterns/PatternPage';
import Glossary from '@/pages/Glossary';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/philosophy" element={<PhilosophyLanding />} />
        <Route path="/philosophy/solid" element={<Solid />} />
        <Route path="/philosophy/tdd" element={<Tdd />} />
        <Route path="/patterns" element={<PatternCatalog />} />
        <Route path="/patterns/:category" element={<CategoryLanding />} />
        <Route path="/patterns/:category/:slug" element={<PatternPage />} />
        <Route path="/glossary" element={<Glossary />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App