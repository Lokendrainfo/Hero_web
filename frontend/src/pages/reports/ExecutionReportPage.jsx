import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { PageHeader } from '../../components/common/PageHeader';
import { HddShotReport } from './HddShotReport';

export const ExecutionReportPage = () => {
  const { selectedVendorId } = useAuth();

  return (
    <div className="screen-container">
      <PageHeader
        title="Execution Report"
        subtitle="Machine-wise and shot-wise HDD telemetry, daily summary, and historical drilling output"
      />
      <HddShotReport selectedVendorId={selectedVendorId} isStandalone={true} />
    </div>
  );
};

export default ExecutionReportPage;
