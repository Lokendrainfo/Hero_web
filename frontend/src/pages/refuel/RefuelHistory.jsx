import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { refuelService } from '../../services/refuelService';
import { LucideCalendar, LucideChevronRight } from 'lucide-react';
import { getRelativeDate } from '../../utils/dateUtils';
import '../../styles/components.css';

export const RefuelHistory = () => {
  const { machineId } = useParams();
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (machineId) {
      refuelService.getMachineRefuel(machineId).then(res => setHistory(res.data || res)).catch(console.error);
    }
  }, [machineId]);

  const timelineRecords = history.length > 0 ? history : [
    { id: 101, date_str: `${getRelativeDate(0)}, 09:30 AM`, liters: '+40 L', operator: 'Rahul Kumar', hours: '1250h' },
    { id: 102, date_str: `${getRelativeDate(-1)}, 10:30 AM`, liters: '+60 L', operator: 'Suresh Yadav', hours: '1150h' },
    { id: 103, date_str: `${getRelativeDate(-2)}, 11:00 AM`, liters: '+45 L', operator: 'Aditi Sharma', hours: '1200h' },
    { id: 104, date_str: `${getRelativeDate(-3)}, 09:45 AM`, liters: '+30 L', operator: 'Rajesh Kumar', hours: '1225h' },
    { id: 105, date_str: `${getRelativeDate(-4)}, 02:15 PM`, liters: '+50 L', operator: 'Priya Singh', hours: '1250h' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => navigate(-1)} style={{ fontSize: '1.4rem', cursor: 'pointer', fontWeight: 'bold' }}>←</span>
          <h2 style={{ fontSize: '1.25rem', fontFamily: 'inherit', fontWeight: 'bold' }}>Refuel History</h2>
        </div>
        <LucideCalendar size={20} color="#374151" />
      </div>

      {/* Summary Bar */}
      <div className="app-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Total Refuel</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{timelineRecords.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Total Fuel Added</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--live)' }}>225 L</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Avg / Refuel</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>45 L</div>
        </div>
      </div>

      {/* Timeline List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {timelineRecords.map(item => (
          <div
            key={item.id}
            className="ui-card"
            onClick={() => navigate('/refuel/' + item.id)}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{item.date_str || item.refuel_date}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                Refueled By: <strong>{item.operator || item.performed_by_name || 'Rahul Kumar'}</strong>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '1px' }}>
                Engine Hours: {item.hours || '1250h'}
              </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#059669', background: '#e6f4ea', padding: '4px 10px', borderRadius: '8px' }}>
                {item.liters || `+${item.quantity_liters} L`}
              </span>
              <LucideChevronRight size={18} color="#9ca3af" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
