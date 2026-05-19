import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Classroom from './pages/Classroom';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { useAppContext } from './context/AppContext';

const AppRoutes = () => {
  const { user } = useAppContext();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route 
        path="/coach/dashboard" 
        element={
          <ProtectedRoute allowedRoles={['coach']}>
            <TeacherDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/student/dashboard" 
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/classroom/:roomId" 
        element={
          <ProtectedRoute>
            <Classroom />
          </ProtectedRoute>
        } 
      />

      {/* Default Redirect */}
      <Route 
        path="/" 
        element={
          user ? (
            <Navigate to={user.role === 'coach' ? '/coach/dashboard' : '/student/dashboard'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
