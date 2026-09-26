import React, { createContext, useContext, useEffect, useState } from 'react';
import { DaySchedule, StudentInfo, SubjectGrades } from '@/types/librus';
import { librusClient } from '@/services/librusClient';
import { mockStudentInfo, mockSubjects, mockTimetable } from '@/services/mockData';

interface LibrusContextType {
  student: StudentInfo | null;
  grades: SubjectGrades[];
  timetable: DaySchedule[];
  isDemo: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
  login: (login: string, pass: string, demo?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const LibrusContext = createContext<LibrusContextType | undefined>(undefined);

export const LibrusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [student, setStudent] = useState<StudentInfo | null>(mockStudentInfo);
  const [grades, setGrades] = useState<SubjectGrades[]>(mockSubjects);
  const [timetable, setTimetable] = useState<DaySchedule[]>(mockTimetable);
  const [isDemo, setIsDemo] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      await librusClient.checkSavedSession();
      const demo = librusClient.isDemo();
      setIsDemo(demo);

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

  const login = async (userLogin: string, pass: string, demo: boolean = false) => {
    setIsLoading(true);
    const res = await librusClient.login(userLogin, pass, demo);
    if (res.success) {
      await loadAllData();
    }
    setIsLoading(false);
    return res;
  };

  const logout = async () => {
    await librusClient.logout();
    await loadAllData();
  };

  return (
    <LibrusContext.Provider
      value={{
        student,
        grades,
        timetable,
        isDemo,
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
