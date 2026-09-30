from unittest.mock import patch, MagicMock
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.integrations.exceptions import IlyncNotFoundException, IlyncTimeoutException, IlyncAuthException
from apps.planner.services.ilync_planner_service import IlyncPlannerService

class PlannerServiceTestCase(TestCase):
    def setUp(self):
        self.plan_id = "43710240-7dd9-4f05-bb87-fc36b85238e5"

    @patch('apps.planner.services.ilync_planner_service.IlyncClient')
    def test_service_get_plan_details(self, MockClient):
        mock_client = MockClient.return_value
        mock_client.get.return_value = {
            "success": True,
            "data": {"id": self.plan_id, "planName": "Test Plan"}
        }
        service = IlyncPlannerService(client=mock_client)
        details = service.get_plan_details(self.plan_id)
        self.assertEqual(details.get('planName'), "Test Plan")

    @patch('apps.planner.services.ilync_planner_service.IlyncClient')
    def test_service_get_map_layers(self, MockClient):
        mock_client = MockClient.return_value
        mock_client.get.return_value = {
            "success": True,
            "data": {
                "paths": {"type": "FeatureCollection", "features": []},
                "nodes": {"type": "FeatureCollection", "features": []}
            }
        }
        service = IlyncPlannerService(client=mock_client)
        layers = service.get_plan_map_layers(self.plan_id)
        self.assertEqual(layers.get('planId'), self.plan_id)
        self.assertIn('paths', layers)
        self.assertIn('nodes', layers)

    @patch('apps.planner.services.ilync_planner_service.IlyncClient')
    def test_service_get_map_layers_timeout(self, MockClient):
        mock_client = MockClient.return_value
        mock_client.get.side_effect = IlyncTimeoutException()
        service = IlyncPlannerService(client=mock_client)
        with self.assertRaises(IlyncTimeoutException):
            service.get_plan_map_layers(self.plan_id)


class PlannerAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.plan_id = "43710240-7dd9-4f05-bb87-fc36b85238e5"

    @patch.object(IlyncPlannerService, 'get_plan_details')
    def test_get_plan_details_endpoint(self, mock_get_details):
        mock_get_details.return_value = {
            "id": self.plan_id,
            "planName": "Jaipur Ring 3 Trenching Plan",
            "circle": "RAJASTHAN",
            "district": "JAIPUR",
            "lengthKm": 12.5,
            "segments": []
        }

        response = self.client.get(f'/api/planner/{self.plan_id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('data', {}).get('planName'), "Jaipur Ring 3 Trenching Plan")

    @patch.object(IlyncPlannerService, 'get_plan_map_layers')
    def test_get_plan_map_layers_endpoint(self, mock_get_layers):
        mock_get_layers.return_value = {
            "planId": self.plan_id,
            "paths": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[75.7873, 26.9124], [75.8000, 26.9200]]
                        },
                        "properties": {
                            "routeName": "Route A-B",
                            "color": "#06b6d4"
                        }
                    }
                ]
            },
            "nodes": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [75.7873, 26.9124]
                        },
                        "properties": {
                            "nodeName": "Node A",
                            "nodeType": "MH"
                        }
                    }
                ]
            }
        }

        response = self.client.get(f'/api/planner/{self.plan_id}/map-layers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data.get('success'))
        self.assertIn('paths', data.get('data', {}))
        self.assertIn('nodes', data.get('data', {}))

    @patch.object(IlyncPlannerService, 'get_plan_details')
    def test_get_plan_details_not_found(self, mock_get_details):
        mock_get_details.side_effect = IlyncNotFoundException("Plan not found")
        response = self.client.get(f'/api/planner/non-existent-plan/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
