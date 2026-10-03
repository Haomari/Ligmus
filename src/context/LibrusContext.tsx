import React, { createContext, useContext, useEffect, useState } from 'react';
import { DaySchedule, StudentInfo, SubjectGrades } from '@/types/librus';
import { librusClient } from '@/services/librusClient';

interface LibrusContextType {
  student: StudentInfo | null;
  grades: SubjectGrades[];
  timetable: DaySchedule[];
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
  login: (login: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const LibrusContext = createContext<LibrusContextType | undefined>(undefined);

export const LibrusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [grades, setGrades] = useState<SubjectGrades[]>([]);
  const [timetable, setTimetable] = useState<DaySchedule[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const hasSession = await librusClient.checkSavedSession();
      setIsAuthenticated(hasSession);

      if (!hasSession) {
        setStudent(null);
        setGrades([]);
        setTimetable([]);
        return;
      }

      const [stu, grd, tt] = await Promise.all([
        librusClient.getStudentInfo(),
        librusClient.getGrades(),
        librusClient.getTimetable(),
      ]);

      setStudent(stu);
      setGrades(grd);
      setTimetable(tt);
    } catch (err) {
      console.error('Failed to load Librus data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const login = async (userLogin: string, pass: string) => {
    setIsLoading(true);
    const res = await librusClient.login(userLogin, pass);
    if (res.success) {
      setIsAuthenticated(true);
      await loadAllData();
    }
    setIsLoading(false);
    return res;
  };

  const logout = async () => {
    setIsLoading(true);
    await librusClient.logout();
    setStudent(null);
    setGrades([]);
    setTimetable([]);
    setIsAuthenticated(false);
    setIsLoading(false);
  };

  return (
    <LibrusContext.Provider
      value={{
        student,
        grades,
        timetable,
        isAuthenticated,
        isLoading,
        refreshData: loadAllData,
        login,
        logout,
      }}>
      {children}
    </LibrusContext.Provider>
  );
};

export const useLibrus = () => {
  const context = useContext(LibrusContext);
  if (!context) {
    throw new Error('useLibrus must be used within a LibrusProvider');
  }
  return context;
};
