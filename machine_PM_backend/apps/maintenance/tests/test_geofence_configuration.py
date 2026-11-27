import json
import pytest

from apps.maintenance.models import MaintenanceLocationAttachment
from .conftest import make_test_image


@pytest.mark.django_db(databases=['default', 'hero'])
class TestGeofenceConfiguration:
    def _save_cfg(self, admin_client, payload):
        return admin_client.post('/api/v1/pm/admin/activity-configurations/', payload, format='json')

    def _submit_daily(self, client, machine_id, checklist_items, item_id, extra_locs, color_offset=0):
        responses = []
        files = {}
        for idx, it in enumerate(checklist_items):
            if it['id'] == item_id:
                responses.append(
                    {
                        'checklist_item_id': item_id,
                        'status': 'COMPLETED',
                        'remarks': 'Geofence check completed',
                        'custom_fields': [{'question_id': q['id'], 'value': 'Yes'} for q in it.get('custom_fields', [])],
                        'locations': extra_locs,
                    }
                )
            else:
                responses.append(
                    {
                        'checklist_item_id': it['id'],
                        'status': 'COMPLETED',
                        'remarks': 'Standard activity ok',
                    }
                )
                files[f'photo_{it["id"]}'] = make_test_image(
                    color=((10 + idx * 7 + color_offset) % 250, 120, 180), filename=f'geo_{color_offset}_{idx}.png'
                )

        return client.post(
            '/api/v1/machine-maintenance/data',
            {
                'machine_id': machine_id,
                'frequency': 'DAILY',
                'hour_meter_reading': '750.0',
                'general_remarks': 'Geofence validation test',
                'responses': json.dumps(responses),
                **files,
            },
            format='multipart',
        )

    def test_invalid_geofence_configuration_rejected(self, seeded_masters, users, make_auth_client):
        admin_client = make_auth_client(users['admin'])

        # Circle missing radius
        r1 = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Bad Circle Geofence',
                'description': 'Missing radius',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Site Check',
                        'questions': [
                            {
                                'question_name': 'Confirm machine location',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Yard GPS',
                                        'is_mandatory': True,
                                        'is_geofence_required': True,
                                        'geofence_type': 'CIRCLE',
                                        'geofence_latitude': 28.4595,
                                        'geofence_longitude': 77.0266,
                                        'geofence_radius_meters': 0,
                                    }
                                ],
                            }
                        ],
                    }
                ],
            },
        )
        assert r1.status_code == 400

        # Polygon with fewer than 3 distinct points
        r2 = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Bad Polygon Geofence',
                'description': 'Too few points',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Site Check',
                        'questions': [
                            {
                                'question_name': 'Confirm polygon site',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Zone Polygon',
                                        'is_mandatory': True,
                                        'is_geofence_required': True,
                                        'geofence_type': 'POLYGON',
                                        'geofence_polygon': [[28.45, 77.02], [28.46, 77.03]],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            },
        )
        assert r2.status_code == 400

    def test_per_requirement_geofence_no_circle_polygon_optional_and_history(
        self, seeded_masters, users, machines, make_auth_client
    ):
        m1, m2 = machines
        admin_client = make_auth_client(users['admin'])
        op_alpha = make_auth_client(users['operator'])
        op_beta = make_auth_client(users['operator_beta'])

        # Configure one activity with 3 independent GPS requirements:
        # 1) Geofence = No (Mandatory)
        # 2) Geofence = Yes, Circle 200m (Mandatory)
        # 3) Geofence = Yes, Polygon (Optional)
        cfg_res = self._save_cfg(
            admin_client,
            {
                'activity_name': 'Site Geofenced Inspection',
                'description': 'Verify per-GPS-requirement geofence boundaries',
                'item_code': 'GEO-AUDIT-01',
                'frequency': 'DAILY',
                'questions_enabled': True,
                'sections': [
                    {
                        'section_name': 'Location Compliance',
                        'display_order': 1,
                        'is_active': True,
                        'questions': [
                            {
                                'temp_key': 'q_free',
                                'question_name': 'Confirm un-fenced GPS checkpoint?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 1,
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Free Live GPS',
                                        'is_mandatory': True,
                                        'is_geofence_required': False,
                                        'display_order': 1,
                                    }
                                ],
                            },
                            {
                                'temp_key': 'q_circle',
                                'question_name': 'Confirm main yard bay check?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 2,
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Main Yard Circle Fence',
                                        'is_mandatory': True,
                                        'is_geofence_required': True,
                                        'geofence_type': 'CIRCLE',
                                        'geofence_reference_name': 'Gurgaon Hub',
                                        'geofence_latitude': 28.4595,
                                        'geofence_longitude': 77.0266,
                                        'geofence_radius_meters': 200,
                                        'display_order': 1,
                                    }
                                ],
                            },
                            {
                                'temp_key': 'q_poly',
                                'question_name': 'Confirm optional perimeter scan?',
                                'answer_type': 'YES_NO',
                                'is_mandatory': True,
                                'display_order': 3,
                                'is_location_required': True,
                                'locations': [
                                    {
                                        'location_name': 'Optional Polygon Zone',
                                        'is_mandatory': False,
                                        'is_geofence_required': True,
                                        'geofence_type': 'POLYGON',
                                        'geofence_reference_name': 'Sector Polygon',
                                        'geofence_polygon': [
                                            [28.4500, 77.0200],
                                            [28.4500, 77.0300],
                                            [28.4650, 77.0300],
                                            [28.4650, 77.0200],
                                        ],
                                        'display_order': 1,
                                    }
                                ],
                            },
                        ],
                    }
                ],
            },
        )
        assert cfg_res.status_code == 201, cfg_res.json()
        cfg = cfg_res.json()['data']
        item_id = cfg['id']
        qs = cfg['sections'][0]['questions']
        loc_free = qs[0]['locations'][0]
        loc_circle = qs[1]['locations'][0]
        loc_poly = qs[2]['locations'][0]

        # Mobile APK Check API returns geofence config
        chk = op_alpha.get(f'/api/v1/machine-maintenance/check?machine_id={m1.id}&frequency=DAILY&activity_id={item_id}')
        assert chk.status_code == 200, chk.json()
        gps_cfg = chk.json()['data']['gps_configuration']
        assert gps_cfg['geofence_required'] is True
        rules_by_id = {r['location_requirement_id']: r for r in gps_cfg['location_validation_rules']}
        assert rules_by_id[loc_free['id']]['is_geofence_required'] is False
        assert rules_by_id[loc_circle['id']]['is_geofence_required'] is True
        assert rules_by_id[loc_circle['id']]['geofence_radius_meters'] == 200
        assert len(rules_by_id[loc_poly['id']]['geofence_polygon']) == 4

        cl_items = op_alpha.get(f'/api/v1/pm/checklist/?frequency=DAILY&machine_id={m1.id}').json()['data']['items']

        # 1) Mandatory Circle outside boundary (~11km away) MUST reject with distance message
        bad_res = self._submit_daily(
            op_alpha,
            m1.id,
            cl_items,
            item_id,
            [
                {'location_requirement_id': loc_free['id'], 'latitude': 19.0760, 'longitude': 72.8777, 'accuracy_meters': 10},
                {'location_requirement_id': loc_circle['id'], 'latitude': 28.5600, 'longitude': 77.0266, 'accuracy_meters': 10},
            ],
            color_offset=0,
        )
        assert bad_res.status_code == 400, bad_res.json()
        assert 'outside the allowed 200m geofence' in json.dumps(bad_res.json())

        # 2) Valid submission:
        # - Free GPS captured anywhere (Mumbai) -> accepted (Geofence=No)
        # - Mandatory Circle inside boundary (center) -> accepted & Geofence Verified
        # - Optional Polygon outside boundary (Mumbai) -> ALLOWED (optional!) & records Outside status + distance
        ok_res = self._submit_daily(
            op_alpha,
            m1.id,
            cl_items,
            item_id,
            [
                {'location_requirement_id': loc_free['id'], 'latitude': 19.0760, 'longitude': 72.8777, 'accuracy_meters': 15},
                {'location_requirement_id': loc_circle['id'], 'latitude': 28.4596, 'longitude': 77.0267, 'accuracy_meters': 8},
                {'location_requirement_id': loc_poly['id'], 'latitude': 19.0760, 'longitude': 72.8777, 'accuracy_meters': 12},
            ],
            color_offset=30,
        )
        assert ok_res.status_code == 201, ok_res.json()
        sub_id = ok_res.json()['data']['submission_id']

        atts = {
            a.location_requirement_id: a
            for a in MaintenanceLocationAttachment.objects.filter(submission_id=sub_id, checklist_item_id=item_id)
        }
        assert atts[loc_free['id']].geofence_required_snapshot is False
        assert atts[loc_free['id']].geofence_is_valid is None

        assert atts[loc_circle['id']].geofence_required_snapshot is True
        assert atts[loc_circle['id']].geofence_is_valid is True
        assert atts[loc_circle['id']].geofence_distance_meters == 0.0
        assert 'Gurgaon Hub' in atts[loc_circle['id']].geofence_validation_message

        assert atts[loc_poly['id']].geofence_required_snapshot is True
        assert atts[loc_poly['id']].geofence_type_snapshot == 'POLYGON'
        assert atts[loc_poly['id']].geofence_is_valid is False
        assert atts[loc_poly['id']].geofence_distance_meters > 1000.0
        assert 'outside the configured Polygon boundary' in atts[loc_poly['id']].geofence_validation_message

        # History endpoint exposes geofence validation fields on attachments
        hist = op_alpha.get(f'/api/v1/pm/submissions/{sub_id}/')
        assert hist.status_code == 200
        hist_item = next(r for r in hist.json()['data']['responses'] if r['checklist_item_id'] == item_id)
        hist_locs = {l['location_requirement_id']: l for l in hist_item['locations']}
        assert hist_locs[loc_circle['id']]['geofence_is_valid'] is True
        assert hist_locs[loc_poly['id']]['geofence_is_valid'] is False

        # 3) Also test Optional Polygon inside boundary records geofence_is_valid=True on m2
        cl_items_m2 = op_beta.get(f'/api/v1/pm/checklist/?frequency=DAILY&machine_id={m2.id}').json()['data']['items']
        ok_m2 = self._submit_daily(
            op_beta,
            m2.id,
            cl_items_m2,
            item_id,
            [
                {'location_requirement_id': loc_free['id'], 'latitude': 28.4595, 'longitude': 77.0266, 'accuracy_meters': 10},
                {'location_requirement_id': loc_circle['id'], 'latitude': 28.4595, 'longitude': 77.0266, 'accuracy_meters': 10},
                {'location_requirement_id': loc_poly['id'], 'latitude': 28.4580, 'longitude': 77.0250, 'accuracy_meters': 10},
            ],
            color_offset=90,
        )
        assert ok_m2.status_code == 201, ok_m2.json()
        sub2_id = ok_m2.json()['data']['submission_id']
        poly_att2 = MaintenanceLocationAttachment.objects.get(submission_id=sub2_id, location_requirement_id=loc_poly['id'])
        assert poly_att2.geofence_is_valid is True
        assert poly_att2.geofence_distance_meters == 0.0
