import React, { useContext, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../context/AppContext';
import { Phone, Plus, Trash2, Edit2, X, Search, UserPlus, Star } from 'lucide-react';
import { addDoc, collection, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function Contacts() {
  const { contacts, user, canEdit } = useContext(AppContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Backward compatibility wrapper
  const normalizedContacts = useMemo(() => {
    return contacts.map(c => {
      if (c.people) return { ...c, people: c.people.map((person, index) => ({ ...person, primary: person.primary ?? index === 0 })) };
      // Convert old format to new format
      const people = [];
      if (c.contactPerson || c.phone) {
        people.push({ name: c.contactPerson || '', role: c.role || '', phone: c.phone || '', primary: true });
      }
      if (c.phone2) {
        people.push({ name: 'Secondary Contact', role: '', phone: c.phone2, primary: false });
      }
      return { ...c, people };
    });
  }, [contacts]);

  const filteredAndSortedContacts = useMemo(() => {
    return normalizedContacts
      .filter(contact => {
        const query = searchQuery.toLowerCase();
        if ((contact.schoolName || '').toLowerCase().includes(query)) return true;
        if (contact.people && contact.people.some(p => p.name.toLowerCase().includes(query))) return true;
        return false;
      })
      .sort((a, b) => {
        return (a.schoolName || '').localeCompare(b.schoolName || '');
      });
  }, [normalizedContacts, searchQuery]);
  
  const [formData, setFormData] = useState({
    schoolName: '',
    people: [{ name: '', role: '', phone: '', primary: true }]
  });

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setEditingId(contact.id);
      setFormData({
        schoolName: contact.schoolName || '',
        people: contact.people ? JSON.parse(JSON.stringify(contact.people)).map((person, index) => ({ ...person, primary: person.primary ?? index === 0 })) : []
      });
    } else {
      setEditingId(null);
      setFormData({ 
        schoolName: '', 
        people: [{ name: '', role: '', phone: '', primary: true }]
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    // Validation and sanitization
    const cleanedPeople = [];
    for (let i = 0; i < formData.people.length; i++) {
      const person = formData.people[i];
      const strippedPhone = person.phone.replace(/\s+/g, '');
      
      if (!/^\d{10}$/.test(strippedPhone)) {
        alert(`Invalid phone number for ${person.name || `Person ${i+1}`}. Phone numbers must be exactly 10 digits without letters.`);
        return; // Stop saving
      }
      
      cleanedPeople.push({ ...person, phone: strippedPhone });
    }

    const id = editingId ? editingId.toString() : Date.now().toString();
    const dataToSave = { 
      id: id,
      schoolName: formData.schoolName,
      people: cleanedPeople
    };
    
    try {
      await setDoc(doc(db, 'contacts', id), dataToSave);
      await addDoc(collection(db, 'activities'), { entityType: 'contact', entityId: id, action: editingId ? 'updated' : 'created', label: formData.schoolName, createdAt: serverTimestamp(), user: user?.displayName || user?.email || 'Portal user' });
      handleCloseModal();
    } catch (err) {
      console.error("Error saving contact: ", err);
      alert("Failed to save contact");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this school and all its contacts?')) {
      try {
        await deleteDoc(doc(db, 'contacts', id.toString()));
        await addDoc(collection(db, 'activities'), { entityType: 'contact', entityId: String(id), action: 'deleted', label: 'School contact record', createdAt: serverTimestamp(), user: user?.displayName || user?.email || 'Portal user' });
      } catch (err) {
        console.error("Error deleting contact: ", err);
      }
    }
  };

  const addPerson = () => {
    setFormData({
      ...formData,
      people: [...formData.people, { name: '', role: '', phone: '', primary: false }]
    });
  };

  const updatePerson = (index, field, value) => {
    const newPeople = [...formData.people];
    newPeople[index][field] = value;
    setFormData({ ...formData, people: newPeople });
  };

  const removePerson = (index) => {
    if (formData.people.length > 1) {
      const newPeople = [...formData.people];
      newPeople.splice(index, 1);
      setFormData({ ...formData, people: newPeople });
    }
  };
  const setPrimary = (index) => setFormData({ ...formData, people: formData.people.map((person, personIndex) => ({ ...person, primary: personIndex === index })) });

  return (
    <div className="animate-fade-in">
      <header className="stack-on-mobile" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1>School Contacts</h1>
          <p className="text-muted">Manage all school connections</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => handleOpenModal()} style={{ width: '100%', justifyContent: 'center' }}>
          <Plus size={18} /> Add Contact
        </button>}
      </header>

      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.7)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
        <Search size={20} style={{ color: 'var(--text-muted)', marginRight: '0.75rem' }} />
        <input 
          type="text" 
          placeholder="Search schools or contact names..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '1rem', padding: '0.5rem 0' }}
        />
      </div>

      <div className="glass-panel" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.5)' }}>
              <th style={{ padding: '1rem', fontWeight: 600, width: '30%' }}>School</th>
              <th style={{ padding: '1rem', fontWeight: 600 }}>Contacts</th>
              {canEdit && <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right', width: '120px' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedContacts.map(contact => (
              <tr key={contact.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', verticalAlign: 'top' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.7)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '1rem', fontWeight: 600 }}>{contact.schoolName}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {contact.people && contact.people.map((person, idx) => (
                      <div key={idx} className="stack-on-mobile" style={{ 
                        display: 'flex', 
                        gap: '1rem', 
                        alignItems: 'center',
                        borderBottom: idx !== contact.people.length - 1 ? '1px solid var(--border-color)' : 'none',
                        paddingBottom: idx !== contact.people.length - 1 ? '1rem' : '0'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{person.name}{person.primary && <span className="contact-primary"><Star size={11} fill="currentColor" />Primary</span>}</div>
                          <div><span className="contact-role">{person.role || 'School contact'}</span></div>
                        </div>
                        {person.phone && (
                          <a href={`tel:${person.phone}`} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            <Phone size={14} style={{ color: 'var(--success-color)' }} />
                            {person.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                {canEdit && <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button onClick={() => handleOpenModal(contact)} className="btn btn-icon" style={{ background: 'transparent', color: 'var(--primary-color)' }}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(contact.id)} className="btn btn-icon" style={{ background: 'transparent', color: 'var(--danger-color)' }}>
                    <Trash2 size={18} />
                  </button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && createPortal(
        <div className="modal-container" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div className="glass-panel animate-fade-in modal-content" style={{ width: '100%', maxWidth: '600px', padding: '2rem', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2>{editingId ? 'Edit School Contacts' : 'Add New School'}</h2>
              <button type="button" onClick={handleCloseModal} className="btn-icon" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label className="form-label">School Name</label>
                <input required type="text" className="form-input" style={{ fontSize: '1.1rem', padding: '0.75rem' }} value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Contacts at this School</h3>
                
                {formData.people.map((person, index) => (
                  <div key={index} style={{ background: 'var(--background-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', position: 'relative' }}>
                    {formData.people.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removePerson(index)} 
                        className="btn-icon" 
                        style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'transparent', color: 'var(--danger-color)' }}
                      >
                        <X size={18} />
                      </button>
                    )}
                    
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input required type="text" className="form-input" value={person.name} onChange={e => updatePerson(index, 'name', e.target.value)} />
                    </div>
                    <label className="primary-check"><input type="radio" name="primary-contact" checked={person.primary || false} onChange={() => setPrimary(index)} /> Primary contact for this school</label>
                    
                    <div className="stack-on-mobile" style={{ display: 'flex', gap: '1rem' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Role</label>
                        <input type="text" className="form-input" placeholder="e.g. Principal, Math Teacher" value={person.role} onChange={e => updatePerson(index, 'role', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Phone Number</label>
                        <input required type="tel" className="form-input" placeholder="071 234 5678" value={person.phone} onChange={e => updatePerson(index, 'phone', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
                
                <button type="button" onClick={addPerson} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
                  <UserPlus size={16} /> Add Another Person
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Contacts</button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
