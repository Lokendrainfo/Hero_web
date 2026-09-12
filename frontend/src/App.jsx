import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { VendorProvider } from './context/VendorContext';
import { ToastProvider } from './context/ToastContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <VendorProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </VendorProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
